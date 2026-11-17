import { config as loadEnv } from 'dotenv';
import { resolveFromRoot } from '@mirror/shared';

loadEnv({ path: resolveFromRoot('.env') });

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { chromium, type Browser } from 'playwright';
import { EVENTS_CHANNEL, RUN_QUEUE_NAME, type MirrorEvent } from '@mirror/contracts';
import { getPrisma, prepareDatabaseUrl } from '@mirror/db';
import { createStorageDriver } from '@mirror/evidence-core';
import { redisOptionsFromUrl } from '@mirror/shared';
import { processRun, WORKER_ID } from './run-processor';

interface RunJobData {
  runId: string;
}

async function main() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  await prepareDatabaseUrl();
  const redisOptions = await redisOptionsFromUrl(process.env.REDIS_URL);
  const publisher = new IORedis(redisOptions);
  const storage = createStorageDriver();
  const prisma = getPrisma();

  let browser: Browser | undefined;
  const getBrowser = async () => {
    if (!browser || !browser.isConnected()) {
      browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        // No flags that weaken isolation (no --disable-web-security, no --no-sandbox unless the host requires it).
        chromiumSandbox: process.env.BROWSER_DISABLE_SANDBOX !== 'true'
      });
    }
    return browser;
  };

  const publish = async (event: MirrorEvent) => {
    await publisher.publish(EVENTS_CHANNEL, JSON.stringify(event)).catch((err) => {
      console.error(`[worker] event publish failed: ${err.message}`);
    });
  };

  const worker = new Worker<RunJobData>(
    RUN_QUEUE_NAME,
    async (job: Job<RunJobData>) => {
      const started = Date.now();
      console.log(`[worker] run=${job.data.runId} attempt=${job.attemptsMade + 1} started`);
      const status = await processRun(job.data.runId, {
        browser: await getBrowser(),
        storage,
        publish,
        attempt: job.attemptsMade + 1
      });
      console.log(`[worker] run=${job.data.runId} finished status=${status} in ${Date.now() - started}ms`);
      return { status };
    },
    {
      connection: redisOptions,
      concurrency: 1,
      // Tuned for metered serverless Redis: long blocking waits, infrequent stall checks.
      drainDelay: 30,
      stalledInterval: 300_000,
      lockDuration: 600_000,
      maxStalledCount: 1
    }
  );

  worker.on('failed', async (job, err) => {
    console.error(`[worker] run=${job?.data.runId} job failed: ${err.message}`);
    if (!job) return;
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      await prisma.executionRun
        .update({ where: { id: job.data.runId }, data: { status: 'failed', error: 'Worker infrastructure failure. See worker logs.', completedAt: new Date() } })
        .catch(() => undefined);
    }
  });
  worker.on('error', (err) => console.error(`[worker] ${err.message}`));

  console.log(`[worker] ${WORKER_ID} listening on queue "${RUN_QUEUE_NAME}"`);

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, finishing current job...`);
    await worker.close();
    await browser?.close().catch(() => undefined);
    await publisher.quit().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
