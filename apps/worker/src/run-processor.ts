import os from 'node:os';
import type { Browser, BrowserContext, Page, Request } from 'playwright';
import {
  NORMALIZATION_VERSION,
  type JourneyStep,
  type MirrorEvent,
  type MirrorEventType,
  type NetworkRequestObservation,
  type PageObservation,
  type RunStatus,
  type SessionConfiguration,
  type SessionRunStatus,
  type StepExecutionResult
} from '@mirror/contracts';
import { getPrisma, type Prisma } from '@mirror/db';
import { compareSessions, type SessionEvidence } from '@mirror/differential-engine';
import { generateManifest, type ManifestArtifact, type StorageDriver } from '@mirror/evidence-core';
import { runJourney } from '@mirror/experiment-runner';
import { buildPageObservation, collectPageSignals, sanitizeNetworkLog } from '@mirror/observation-engine';
import { assertTargetAllowed, hostMatchesDomain, nowIso, parseAllowList, TargetBlockedError } from '@mirror/shared';

export const WORKER_ID = `${os.hostname()}:${process.pid}`;
const TERMINAL: RunStatus[] = ['completed', 'partial', 'failed', 'cancelled', 'blocked'];
const MAX_DOM_BYTES = Number(process.env.MAX_DOM_SNAPSHOT_SIZE_MB ?? 10) * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = Number(process.env.MAX_SCREENSHOT_SIZE_MB ?? 15) * 1024 * 1024;
const STEP_TIMEOUT_MS = Math.min(Number(process.env.BROWSER_TIMEOUT_MS ?? 60000), 60000);
const FINANCIAL_PATH = /(pay|payment|charge|purchase|place-?order|submit-?order|confirm-?order|billing)/i;

export interface ProcessorDeps {
  browser: Browser;
  storage: StorageDriver;
  publish: (event: MirrorEvent) => Promise<void>;
  attempt: number;
}

interface SessionState {
  id: string;
  name: string;
  role: string;
  status: SessionRunStatus;
  steps: StepExecutionResult[];
  error?: string;
  checkpoints: Record<string, { observationId: string; observation: PageObservation; screenshotArtifactId?: string }>;
}

class SerialWriter {
  private chain: Promise<unknown> = Promise.resolve();
  run(task: () => Promise<unknown>) {
    this.chain = this.chain.then(task, task);
    return this.chain;
  }
}

/** Bounded parallelism: sessions run concurrently so they observe the target in the same time window. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function processRun(runId: string, deps: ProcessorDeps): Promise<RunStatus> {
  const prisma = getPrisma();
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: {
      experiment: {
        include: {
          sessions: { orderBy: { createdAt: 'asc' } },
          journeys: { orderBy: { version: 'desc' }, take: 1, include: { steps: { orderBy: { sequence: 'asc' } } } },
          investigation: { include: { authorizationScope: true } }
        }
      }
    }
  });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (TERMINAL.includes(run.status as RunStatus)) return run.status as RunStatus; // idempotent re-delivery

  const experiment = run.experiment;
  const investigation = experiment.investigation;
  const journey = experiment.journeys[0];
  const emit = (event: MirrorEventType, payload: Record<string, unknown> = {}, sessionId?: string) =>
    deps.publish({ event, runId, experimentId: experiment.id, sessionId, timestamp: nowIso(), payload });

  if (run.status === 'cancelling') {
    await prisma.executionRun.update({ where: { id: runId }, data: { status: 'cancelled', completedAt: new Date() } });
    await emit('experiment:failed', { status: 'cancelled' });
    return 'cancelled';
  }

  // A retried attempt starts clean; stored files from earlier attempts remain immutable under their own prefix.
  await prisma.$transaction([
    prisma.differenceFinding.deleteMany({ where: { executionRunId: runId } }),
    prisma.evidenceArtifact.deleteMany({ where: { executionRunId: runId } }),
    prisma.browserObservation.deleteMany({ where: { executionRunId: runId } })
  ]);

  const sessions: SessionState[] = experiment.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.sessionRole,
    status: 'pending',
    steps: [],
    checkpoints: {}
  }));
  const metadataWriter = new SerialWriter();
  const startedAt = new Date();
  const persistMetadata = (extra: Record<string, unknown> = {}) =>
    metadataWriter.run(() =>
      prisma.executionRun.update({
        where: { id: runId },
        data: {
          executionMetadata: {
            attempt: deps.attempt,
            workerId: WORKER_ID,
            browserVersion: deps.browser.version(),
            normalizationVersion: NORMALIZATION_VERSION,
            journeyId: journey?.id,
            journeyVersion: journey?.version,
            sessions: sessions.map((s) => ({ id: s.id, name: s.name, role: s.role, status: s.status, error: s.error, steps: s.steps })),
            ...extra
          } as unknown as Prisma.InputJsonValue
        }
      })
    );

  await prisma.executionRun.update({
    where: { id: runId },
    data: { status: 'running', startedAt, workerId: WORKER_ID, error: null }
  });
  await prisma.investigation.update({ where: { id: investigation.id }, data: { status: 'running' } });
  await persistMetadata();
  await emit('experiment:started', { sessions: sessions.map((s) => ({ id: s.id, name: s.name, role: s.role })) });

  if (!journey || journey.steps.length === 0) {
    return finish('failed', 'Experiment has no journey steps.');
  }
  const steps = journey.steps.map((s) => s.configuration as unknown as JourneyStep);
  const policy = {
    permittedDomain: investigation.authorizationScope.permittedDomain,
    allowedTestHosts: parseAllowList(process.env.ALLOWED_TEST_DOMAINS)
  };

  // Validate the target again in the worker: API validation alone is not trusted.
  try {
    await assertTargetAllowed(investigation.targetUrl, policy);
  } catch (err) {
    sessions.forEach((s) => (s.status = 'blocked'));
    return finish('blocked', err instanceof Error ? err.message : 'Target blocked');
  }

  const artifacts: ManifestArtifact[] = [];
  const isCancelled = async () => {
    const current = await prisma.executionRun.findUnique({ where: { id: runId }, select: { status: true } });
    return current?.status === 'cancelling' || current?.status === 'cancelled';
  };

  const storeArtifact = async (
    key: string,
    type: string,
    data: Buffer | string,
    observationId: string | null,
    metadata: Record<string, unknown>
  ) => {
    const storageKey = `runs/${runId}/a${deps.attempt}/${key}`;
    const stored = await deps.storage.put(storageKey, data);
    const record = await prisma.evidenceArtifact.create({
      data: {
        executionRunId: runId,
        observationId,
        type,
        storageKey,
        sha256: stored.sha256,
        size: stored.size,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
    artifacts.push({ artifactId: record.id, type, storageKey, sha256: stored.sha256, size: stored.size, capturedAt: record.createdAt.toISOString() });
    return record;
  };

  const concurrency = Number(process.env.BROWSER_MAX_CONCURRENCY ?? 2);
  await mapWithConcurrency(sessions, concurrency, async (state) => {
    const sessionRecord = experiment.sessions.find((s) => s.id === state.id)!;
    const config = sessionRecord.configuration as unknown as SessionConfiguration;
    state.status = 'running';
    await persistMetadata();
    await emit('session:started', { name: state.name, role: state.role }, state.id);

    let context: BrowserContext | undefined;
    const network: NetworkRequestObservation[] = [];
    const requestStart = new Map<Request, number>();
    let violation: string | undefined;
    const hostVerdicts = new Map<string, Promise<boolean>>();

    try {
      context = await deps.browser.newContext({
        viewport: config.viewport,
        deviceScaleFactor: config.deviceScaleFactor ?? 1,
        locale: config.locale,
        timezoneId: config.timezoneId,
        userAgent: config.userAgent,
        extraHTTPHeaders: config.extraHeaders,
        serviceWorkers: 'block',
        acceptDownloads: false,
        bypassCSP: false
      });

      // Network guard: every request is checked, independently of API validation.
      await context.route('**/*', async (route) => {
        const request = route.request();
        let url: URL;
        try {
          url = new URL(request.url());
        } catch {
          return route.abort('blockedbyclient');
        }
        if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return route.abort('blockedbyclient');

        const isMainDocument = request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame();
        if (isMainDocument && request.method() !== 'GET') {
          violation = 'Blocked a non-GET page submission: MIRROR never submits forms that could create orders or payments.';
          return route.abort('blockedbyclient');
        }
        if (request.method() !== 'GET' && FINANCIAL_PATH.test(url.pathname)) {
          return route.abort('blockedbyclient');
        }
        if (isMainDocument && !hostMatchesDomain(url.hostname, policy.permittedDomain)) {
          violation = `Navigation to ${url.hostname} is outside the authorized scope.`;
          return route.abort('blockedbyclient');
        }
        // Subresources may come from third-party hosts, but never from internal addresses (DNS checked, cached per host).
        const host = url.hostname.toLowerCase();
        if (!hostVerdicts.has(host)) {
          hostVerdicts.set(
            host,
            assertTargetAllowed(url.toString(), { allowedTestHosts: policy.allowedTestHosts }).then(
              () => true,
              () => false
            )
          );
        }
        if (!(await hostVerdicts.get(host))) {
          if (isMainDocument) violation = `Navigation to ${host} targets a protected internal address.`;
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      const page: Page = await context.newPage();
      page.on('request', (req) => {
        requestStart.set(req, Date.now());
        // Redirect hops bypass route(); re-validate their destination here.
        if (req.redirectedFrom() && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
          const u = new URL(req.url());
          if (!hostMatchesDomain(u.hostname, policy.permittedDomain)) {
            violation = `Redirect to ${u.hostname} left the authorized scope.`;
          }
        }
      });
      const record = async (req: Request, failure?: string) => {
        const response = failure ? null : await req.response().catch(() => null);
        network.push({
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
          status: response?.status() ?? null,
          durationMs: requestStart.has(req) ? Date.now() - requestStart.get(req)! : null,
          failure
        });
      };
      page.on('requestfinished', (req) => void record(req));
      page.on('requestfailed', (req) => void record(req, req.failure()?.errorText ?? 'failed'));

      const result = await runJourney({
        page,
        steps,
        targetUrl: investigation.targetUrl,
        defaultTimeoutMs: Math.min(STEP_TIMEOUT_MS, 30000),
        assertUrlAllowed: (url) => assertTargetAllowed(url, policy),
        isCancelled: async () => (violation ? true : isCancelled()),
        onStep: async (step) => {
          state.steps.push(step);
          await persistMetadata();
          await emit('session:progress', { step }, state.id);
        },
        onCapture: async (checkpoint) => {
          if (violation) throw new TargetBlockedError(violation);
          const signals = await page.evaluate(collectPageSignals);
          const capturedAt = nowIso();
          const observation = buildPageObservation(signals, { checkpoint, capturedAt, viewport: config.viewport });
          const obsRecord = await prisma.browserObservation.create({
            data: {
              executionRunId: runId,
              sessionId: state.id,
              observationType: 'page_state',
              checkpoint,
              payload: observation as unknown as Prisma.InputJsonValue,
              capturedAt: new Date(capturedAt)
            }
          });

          const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
          let screenshotArtifactId: string | undefined;
          if (screenshot.length <= MAX_SCREENSHOT_BYTES) {
            const art = await storeArtifact(`${state.id}/${checkpoint}.png`, 'screenshot', screenshot, obsRecord.id, {
              checkpoint,
              sessionId: state.id,
              contentType: 'image/png',
              viewport: config.viewport
            });
            screenshotArtifactId = art.id;
          }
          const html = await page.content();
          if (Buffer.byteLength(html) <= MAX_DOM_BYTES) {
            await storeArtifact(`${state.id}/${checkpoint}.html`, 'dom_html', html, obsRecord.id, {
              checkpoint,
              sessionId: state.id,
              contentType: 'text/html'
            });
          }
          await storeArtifact(`${state.id}/${checkpoint}.observation.json`, 'observation_json', JSON.stringify(observation, null, 2), obsRecord.id, {
            checkpoint,
            sessionId: state.id,
            contentType: 'application/json'
          });

          state.checkpoints[checkpoint] = { observationId: obsRecord.id, observation, screenshotArtifactId };
          await emit(
            'observation:captured',
            {
              observationId: obsRecord.id,
              checkpoint,
              url: observation.url,
              screenshotArtifactId,
              commercialValues: observation.commercialValues.length,
              formControls: observation.formControls.length
            },
            state.id
          );
        }
      });

      if (violation) {
        state.status = 'blocked';
        state.error = violation;
      } else {
        state.status =
          result.outcome === 'completed' ? 'completed' : result.outcome === 'blocked' ? 'blocked' : result.outcome === 'cancelled' ? 'cancelled' : 'failed';
        state.error = result.error;
      }
      if (state.status === 'failed' || state.status === 'blocked') {
        // Preserve evidence of the failure state where safe.
        const shot = await page.screenshot({ fullPage: false }).catch(() => null);
        if (shot) await storeArtifact(`${state.id}/failure.png`, 'screenshot', shot, null, { sessionId: state.id, failure: true, contentType: 'image/png' });
      }
    } catch (err) {
      state.status = err instanceof TargetBlockedError ? 'blocked' : 'failed';
      state.error = err instanceof Error ? err.message.split('\n')[0] : String(err);
    } finally {
      if (network.length) {
        await storeArtifact(`${state.id}/network.json`, 'network_json', JSON.stringify(sanitizeNetworkLog(network), null, 2), null, {
          sessionId: state.id,
          requests: network.length,
          contentType: 'application/json'
        }).catch(() => undefined);
      }
      await context?.close().catch(() => undefined);
      await persistMetadata();
      await emit(
        state.status === 'completed' ? 'session:completed' : 'session:failed',
        { status: state.status, error: state.error, checkpoints: Object.keys(state.checkpoints) },
        state.id
      );
    }
  });

  if (await isCancelled()) return finish('cancelled', 'Run cancelled by operator.');

  // Deterministic analysis
  const baseline = sessions.find((s) => s.role === 'baseline') ?? sessions[0];
  if (baseline.status !== 'completed' && Object.keys(baseline.checkpoints).length === 0) {
    const status: RunStatus = baseline.status === 'blocked' ? 'blocked' : 'failed';
    return finish(status, `Baseline session did not produce observations: ${baseline.error ?? 'unknown error'}`);
  }

  await prisma.executionRun.update({ where: { id: runId }, data: { status: 'analysing' } });
  await emit('analysis:started');

  const toEvidence = (s: SessionState): SessionEvidence => {
    const cfg = experiment.sessions.find((x) => x.id === s.id)!.configuration as unknown as SessionConfiguration;
    return {
      sessionId: s.id,
      sessionName: s.name,
      status: s.status,
      viewport: cfg.viewport,
      steps: s.steps,
      checkpoints: Object.fromEntries(Object.entries(s.checkpoints).map(([k, v]) => [k, { observationId: v.observationId, observation: v.observation }]))
    };
  };
  const now = nowIso();
  const findings = sessions
    .filter((s) => s.id !== baseline.id && Object.keys(s.checkpoints).length > 0)
    .flatMap((s) => compareSessions({ experimentId: experiment.id, runId, baseline: toEvidence(baseline), comparison: toEvidence(s), now }));

  if (findings.length) {
    await prisma.differenceFinding.createMany({
      skipDuplicates: true,
      data: findings.map((f) => ({
        id: f.id,
        experimentId: f.experimentId,
        executionRunId: f.executionRunId,
        baselineSessionId: f.baselineSessionId,
        comparisonSessionId: f.comparisonSessionId,
        checkpoint: f.checkpoint,
        subjectKey: f.subjectKey,
        baselineObservationId: f.baselineObservationId ?? null,
        comparisonObservationId: f.comparisonObservationId ?? null,
        type: f.type,
        severity: f.severity,
        confidence: f.confidence,
        classification: f.classification,
        description: f.description,
        evidenceReferences: f.evidenceReferences,
        details: f.details as unknown as Prisma.InputJsonValue,
        confidenceRationale: f.confidenceRationale,
        createdAt: new Date(f.createdAt)
      }))
    });
    for (const f of findings) {
      await emit('finding:created', { findingId: f.id, type: f.type, severity: f.severity, description: f.description }, f.comparisonSessionId);
    }
  }

  const manifest = generateManifest(runId, artifacts, nowIso());
  await storeArtifact('manifest.json', 'manifest', JSON.stringify(manifest, null, 2), null, {
    artifacts: artifacts.length,
    contentType: 'application/json'
  });

  const comparisons = sessions.filter((s) => s.id !== baseline.id);
  const allCompleted = sessions.every((s) => s.status === 'completed');
  const anyCompared = comparisons.some((s) => Object.keys(s.checkpoints).length > 0);
  const status: RunStatus = allCompleted ? 'completed' : anyCompared ? 'partial' : 'failed';
  return finish(status, allCompleted ? null : sessions.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`).join(' | ') || null, findings.length);

  async function finish(status: RunStatus, error: string | null, findingCount = 0): Promise<RunStatus> {
    await persistMetadata({ findingCount, durationMs: Date.now() - startedAt.getTime() });
    await prisma.executionRun.update({ where: { id: runId }, data: { status, error, completedAt: new Date() } });
    await prisma.investigation.update({ where: { id: investigation.id }, data: { status } });
    await prisma.auditEvent.create({
      data: { investigationId: investigation.id, eventType: `run.${status}`, metadata: { runId, findingCount, workerId: WORKER_ID } }
    });
    await emit(status === 'completed' || status === 'partial' ? 'experiment:completed' : 'experiment:failed', { status, error, findingCount });
    return status;
  }
}
