import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { EVENTS_CHANNEL, RUN_QUEUE_NAME, type MirrorEvent } from '@mirror/contracts';
import { redisOptionsFromUrl, type RedisConnectionOptions } from '@mirror/shared';

export interface Infra {
  queue: Queue<{ runId: string }>;
  subscriber: IORedis;
  redis: IORedis;
  close(): Promise<void>;
}

export async function createInfra(onEvent: (event: MirrorEvent) => void): Promise<Infra> {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
  const options: RedisConnectionOptions = await redisOptionsFromUrl(process.env.REDIS_URL);

  const queue = new Queue<{ runId: string }>(RUN_QUEUE_NAME, {
    connection: options,
    defaultJobOptions: {
      // Retry only infrastructure failures; journey failures are recorded, not retried.
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 500
    }
  });

  const redis = new IORedis(options);
  const subscriber = new IORedis(options);
  await subscriber.subscribe(EVENTS_CHANNEL);
  subscriber.on('message', (_channel, message) => {
    try {
      onEvent(JSON.parse(message) as MirrorEvent);
    } catch {
      // Ignore malformed messages
    }
  });

  return {
    queue,
    subscriber,
    redis,
    async close() {
      await queue.close();
      await subscriber.quit().catch(() => undefined);
      await redis.quit().catch(() => undefined);
    }
  };
}
