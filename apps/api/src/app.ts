import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { z, ZodError } from 'zod';
import type { Queue } from 'bullmq';
import { getPrisma, type Prisma } from '@mirror/db';
import { createStorageDriver, verifyManifest } from '@mirror/evidence-core';
import { CreateInvestigationSchema, FindingQuerySchema, ListQuerySchema, UpdateInvestigationSchema } from '@mirror/schemas';
import type { EvidenceManifest, SessionConfiguration } from '@mirror/contracts';
import { assertTargetAllowed, fingerprint, parseAllowList, TargetBlockedError, verifyManifestArtifactSafe } from './util';
import { buildRunReport, renderReportPdf } from './reports';
import { computeSha256 } from '@mirror/shared';
import {
  ChangePasswordSchema,
  LoginSchema,
  RegisterSchema,
  SESSION_COOKIE,
  UpdateAccountSchema,
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  getDummyHash,
  hashPassword,
  hashToken,
  loginThrottled,
  recordLoginFailure,
  requireAuth,
  requireCsrfHeader,
  setSessionCookie,
  verifyPassword,
  type AuthedRequest
} from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req as AuthedRequest, res).catch(next);

const ACTIVE_RUN_STATUSES = ['queued', 'starting', 'running', 'analysing', 'cancelling'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idParam(req: Request, name = 'id'): string {
  const value = req.params[name];
  if (!UUID.test(value)) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${(req as AuthedRequest).user?.id ?? ''}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > limit) return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.'));
    next();
  };
}

const PageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const FindingListSchema = PageSchema.extend({
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  type: z.string().max(40).optional(),
  classification: z.enum(['confirmed_observation', 'supported_interpretation', 'hypothesis']).optional(),
  investigationId: z.string().uuid().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  from: z.coerce.date().optional(),
  q: z.string().trim().max(120).optional()
});

const EvidenceListSchema = PageSchema.extend({
  type: z.string().max(40).optional(),
  investigationId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional()
});

const InvestigationListSchema = ListQuerySchema.extend({
  sort: z.enum(['updated', 'created', 'title']).default('updated'),
  from: z.coerce.date().optional()
});

const CreateReportSchema = z.object({ runId: z.string().uuid(), format: z.enum(['json', 'pdf']) });

export interface AppDeps {
  queue: Queue<{ runId: string }>;
  health: () => Promise<Record<string, string>>;
}

export function createApp(deps: AppDeps): express.Express {
  const prisma = getPrisma();
  const storage = createStorageDriver();
  const app = express();
  const allowedOrigins = parseAllowList(process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? 'http://localhost:5173');
  const allowRegistration = process.env.ALLOW_REGISTRATION !== 'false';

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin.toLowerCase())),
      credentials: true,
      exposedHeaders: ['X-Content-SHA256', 'X-Evidence-Verified', 'Content-Disposition']
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  const audit = (userId: string | null, eventType: string, metadata: Record<string, unknown>, investigationId?: string | null) =>
    prisma.auditEvent.create({ data: { userId, eventType, metadata: metadata as Prisma.InputJsonValue, investigationId: investigationId ?? null } });

  app.get('/health', h(async (_req, res) => {
    const checks = await deps.health();
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', service: 'api', checks, timestamp: new Date().toISOString() });
  }));

  const api = express.Router();
  api.use(requireCsrfHeader());

  // ---------------------------------------------------------------------------
  // Authentication (public)
  // ---------------------------------------------------------------------------

  api.get('/auth/config', h(async (_req, res) => {
    res.json({ data: { registrationEnabled: allowRegistration } });
  }));

  api.post('/auth/register', rateLimit(10, 15 * 60_000), h(async (req, res) => {
    if (!allowRegistration) throw new ApiError(403, 'REGISTRATION_DISABLED', 'Registration is disabled on this deployment.');
    const input = RegisterSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    const user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password), lastLoginAt: new Date() },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    const { token } = await createSession(user.id, req);
    setSessionCookie(res, token);
    await audit(user.id, 'auth.registered', { ip: req.ip });
    res.status(201).json({ data: user });
  }));

  api.post('/auth/login', h(async (req, res) => {
    const input = LoginSchema.parse(req.body);
    const ip = req.ip ?? 'unknown';
    if (loginThrottled(ip, input.email)) {
      throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Wait 15 minutes and try again.');
    }
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !user.passwordHash || !valid) {
      recordLoginFailure(ip, input.email);
      if (user) await audit(user.id, 'auth.login_failed', { ip });
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    clearLoginFailures(input.email);
    const { token } = await createSession(user.id, req);
    setSessionCookie(res, token);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'auth.login', { ip });
    res.json({ data: { id: user.id, email: user.email, name: user.name } });
  }));

  api.post('/auth/logout', h(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) } });
      if (session && !session.revokedAt) {
        await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        await audit(session.userId, 'auth.logout', {});
      }
    }
    clearSessionCookie(res);
    res.status(204).end();
  }));

  // Everything below requires a valid session.
  api.use(requireAuth());

  api.get('/auth/me', h(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true }
    });
    res.json({ data: user });
  }));

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  api.patch('/account', h(async (req, res) => {
    const input = UpdateAccountSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { name: input.name }, select: { id: true, email: true, name: true } });
    await audit(req.user.id, 'account.updated', { fields: ['name'] });
    res.json({ data: user });
  }));

  api.post('/account/password', rateLimit(5, 15 * 60_000), h(async (req, res) => {
    const input = ChangePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect.', [{ path: 'currentPassword', message: 'Current password is incorrect.' }]);
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } }),
      // Sign out every other session after a password change.
      prisma.authSession.updateMany({ where: { userId: user.id, id: { not: req.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    await audit(user.id, 'account.password_changed', {});
    res.json({ data: { ok: true } });
  }));

  api.get('/account/sessions', h(async (req, res) => {
    const sessions = await prisma.authSession.findMany({
      where: { userId: req.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true }
    });
    res.json({ data: sessions.map((s) => ({ ...s, current: s.id === req.sessionId })) });
  }));

  api.delete('/account/sessions/:id', h(async (req, res) => {
    const id = idParam(req);
    const result = await prisma.authSession.updateMany({ where: { id, userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new ApiError(404, 'NOT_FOUND', 'Session not found');
    await audit(req.user.id, 'auth.session_revoked', { sessionId: id });
    res.status(204).end();
  }));

  // ---------------------------------------------------------------------------
  // Workspace data
  // ---------------------------------------------------------------------------

  const ownedInvestigation = (req: AuthedRequest, id: string) => ({ id, userId: req.user.id });
  const runScope = (req: AuthedRequest) => ({ experiment: { investigation: { userId: req.user.id } } });
  const ownedRun = (req: AuthedRequest, id: string) => ({ id, ...runScope(req) });

  async function enqueueRun(experimentId: string) {
    const active = await prisma.executionRun.count({ where: { experimentId, status: { in: ACTIVE_RUN_STATUSES } } });
    if (active > 0) throw new ApiError(409, 'RUN_IN_PROGRESS', 'This experiment already has a run in progress.');
    const run = await prisma.executionRun.create({ data: { experimentId, status: 'queued' } });
    await deps.queue.add('run', { runId: run.id }, { jobId: run.id });
    return run;
  }

  api.get('/settings', h(async (_req, res) => {
    res.json({
      data: {
        demoStoreUrl: process.env.DEMO_STORE_URL ?? null,
        aiProvider: process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'none' ? process.env.AI_PROVIDER : null,
        registrationEnabled: allowRegistration,
        storageDriver: process.env.STORAGE_DRIVER ?? 'local',
        limits: {
          maxConcurrency: Number(process.env.BROWSER_MAX_CONCURRENCY ?? 2),
          stepTimeoutMs: Number(process.env.BROWSER_TIMEOUT_MS ?? 60000),
          evidenceRetentionDays: Number(process.env.EVIDENCE_RETENTION_DAYS ?? 30),
          maxScreenshotMb: Number(process.env.MAX_SCREENSHOT_SIZE_MB ?? 15),
          maxDomSnapshotMb: Number(process.env.MAX_DOM_SNAPSHOT_SIZE_MB ?? 10)
        },
        allowedTestHosts: parseAllowList(process.env.ALLOWED_TEST_DOMAINS)
      }
    });
  }));

  api.get('/overview', h(async (req, res) => {
    const scope = runScope(req);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [investigations, experiments, runs, activeRuns, findings, highFindings, artifacts, byType, bySeverity, history, recentRuns, recentFindings, activity] =
      await Promise.all([
        prisma.investigation.count({ where: { userId: req.user.id, archivedAt: null } }),
        prisma.experiment.count({ where: { investigation: { userId: req.user.id } } }),
        prisma.executionRun.count({ where: scope }),
        prisma.executionRun.findMany({
          where: { ...scope, status: { in: ACTIVE_RUN_STATUSES } },
          orderBy: { createdAt: 'desc' },
          include: { experiment: { select: { investigation: { select: { id: true, title: true } } } } }
        }),
        prisma.differenceFinding.count({ where: scope }),
        prisma.differenceFinding.count({ where: { ...scope, severity: { in: ['high', 'critical'] } } }),
        prisma.evidenceArtifact.count({ where: { executionRun: scope } }),
        prisma.differenceFinding.groupBy({ by: ['type'], where: scope, _count: { _all: true } }),
        prisma.differenceFinding.groupBy({ by: ['severity'], where: scope, _count: { _all: true } }),
        prisma.executionRun.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { createdAt: true, status: true, startedAt: true, completedAt: true } }),
        prisma.executionRun.findMany({
          where: scope,
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            experiment: { select: { id: true, investigation: { select: { id: true, title: true, targetUrl: true } }, _count: { select: { sessions: true } } } },
            _count: { select: { findings: true, artifacts: true } }
          }
        }),
        prisma.differenceFinding.findMany({
          where: scope,
          orderBy: [{ createdAt: 'desc' }],
          take: 40,
          select: {
            id: true,
            type: true,
            severity: true,
            description: true,
            createdAt: true,
            checkpoint: true,
            details: true,
            executionRunId: true,
            baselineSessionId: true,
            comparisonSessionId: true
          }
        }),
        prisma.auditEvent.findMany({
          where: { OR: [{ userId: req.user.id }, { investigation: { userId: req.user.id } }] },
          orderBy: { timestamp: 'desc' },
          take: 12
        })
      ]);

    // Daily execution history (UTC days), split by outcome.
    const days: Array<{ date: string; completed: number; partial: number; failed: number; other: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ date: d, completed: 0, partial: 0, failed: 0, other: 0 });
    }
    for (const r of history) {
      const day = days.find((d) => d.date === r.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      if (r.status === 'completed') day.completed++;
      else if (r.status === 'partial') day.partial++;
      else if (r.status === 'failed' || r.status === 'blocked') day.failed++;
      else day.other++;
    }
    const finished = history.filter((r) => r.completedAt && r.startedAt);
    const avgDurationMs = finished.length
      ? Math.round(finished.reduce((acc, r) => acc + (r.completedAt!.getTime() - r.startedAt!.getTime()), 0) / finished.length)
      : null;
    const terminal = history.filter((r) => ['completed', 'partial', 'failed', 'blocked'].includes(r.status));

    // Spotlight: the most recent completed run with a commercial difference, with its real screenshots.
    // Prefer a difference with a value on both sides (e.g. a changed total), then any commercial one.
    const commercial = recentFindings.filter(
      (f) => ['price_difference', 'fee_difference', 'subscription_difference'].includes(f.type) && (f.details as { delta?: number }).delta !== undefined
    );
    const bothSides = (f: (typeof recentFindings)[number]) => {
      const d = f.details as { baseline?: unknown; comparison?: unknown };
      return Boolean(d.baseline && d.comparison);
    };
    const spotlightFinding = commercial.find((f) => bothSides(f) && f.executionRunId === commercial[0]?.executionRunId) ?? commercial[0];
    let spotlight = null;
    if (spotlightFinding) {
      const run = await prisma.executionRun.findFirst({
        where: { id: spotlightFinding.executionRunId },
        include: {
          experiment: { include: { investigation: { select: { id: true, title: true, targetUrl: true } }, sessions: { select: { id: true, name: true, sessionRole: true } } } },
          _count: { select: { findings: true, artifacts: true } },
          observations: {
            where: { checkpoint: spotlightFinding.checkpoint, sessionId: { in: [spotlightFinding.baselineSessionId, spotlightFinding.comparisonSessionId] } },
            select: { id: true, sessionId: true, artifacts: { where: { type: 'screenshot' }, select: { id: true } } }
          }
        }
      });
      if (run) {
        const shot = (sid: string) => run.observations.find((o) => o.sessionId === sid)?.artifacts[0]?.id ?? null;
        const name = (sid: string) => run.experiment.sessions.find((s) => s.id === sid)?.name ?? 'Session';
        const d = spotlightFinding.details as { baseline?: { value: string | null } | null; comparison?: { value: string | null } | null; subject?: string };
        spotlight = {
          runId: run.id,
          investigation: run.experiment.investigation,
          sessions: run.experiment.sessions.length,
          findings: run._count.findings,
          artifacts: run._count.artifacts,
          status: run.status,
          checkpoint: spotlightFinding.checkpoint,
          finding: { id: spotlightFinding.id, type: spotlightFinding.type, severity: spotlightFinding.severity, subject: d.subject ?? '' },
          baseline: { name: name(spotlightFinding.baselineSessionId), value: d.baseline?.value ?? null, screenshotId: shot(spotlightFinding.baselineSessionId) },
          comparison: { name: name(spotlightFinding.comparisonSessionId), value: d.comparison?.value ?? null, screenshotId: shot(spotlightFinding.comparisonSessionId) }
        };
      }
    }

    const sessionNames = new Map<string, string>();
    const sessionIds = Array.from(new Set(recentFindings.slice(0, 6).flatMap((f) => [f.baselineSessionId, f.comparisonSessionId])));
    if (sessionIds.length) {
      for (const s of await prisma.experimentSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } })) sessionNames.set(s.id, s.name);
    }

    res.json({
      data: {
        totals: { investigations, experiments, runs, activeRuns: activeRuns.length, findings, highFindings, artifacts },
        findingsByType: byType.map((t) => ({ type: t.type, count: t._count._all })).sort((a, b) => b.count - a.count),
        findingsBySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count._all })),
        history: days,
        health: {
          window: terminal.length,
          completed: terminal.filter((r) => r.status === 'completed').length,
          partial: terminal.filter((r) => r.status === 'partial').length,
          failed: terminal.filter((r) => r.status === 'failed' || r.status === 'blocked').length,
          avgDurationMs
        },
        activeRuns,
        recentRuns,
        recentFindings: recentFindings.slice(0, 6).map((f) => ({
          id: f.id,
          type: f.type,
          severity: f.severity,
          description: f.description,
          createdAt: f.createdAt,
          runId: f.executionRunId,
          subject: (f.details as { subject?: string }).subject ?? '',
          baselineName: sessionNames.get(f.baselineSessionId) ?? null,
          comparisonName: sessionNames.get(f.comparisonSessionId) ?? null
        })),
        activity,
        spotlight
      }
    });
  }));

  api.get('/search', h(async (req, res) => {
    const q = z.string().trim().min(2).max(120).parse(req.query.q);
    const [investigations, findings, runs] = await Promise.all([
      prisma.investigation.findMany({
        where: { userId: req.user.id, OR: [{ title: { contains: q, mode: 'insensitive' } }, { targetUrl: { contains: q, mode: 'insensitive' } }] },
        take: 6,
        select: { id: true, title: true, targetUrl: true, status: true }
      }),
      prisma.differenceFinding.findMany({
        where: { ...runScope(req), description: { contains: q, mode: 'insensitive' } },
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, severity: true, description: true, executionRunId: true }
      }),
      /^[0-9a-f-]{4,36}$/i.test(q)
        ? prisma.executionRun.findMany({ where: { ...runScope(req), id: { startsWith: q.toLowerCase() } }, take: 5, select: { id: true, status: true, createdAt: true } })
        : Promise.resolve([])
    ]);
    res.json({ data: { investigations, findings, runs } });
  }));

  api.get('/notifications', h(async (req, res) => {
    const events = await prisma.auditEvent.findMany({
      where: { investigation: { userId: req.user.id }, eventType: { startsWith: 'run.' }, NOT: { eventType: 'run.queued' } },
      orderBy: { timestamp: 'desc' },
      take: 15,
      include: { investigation: { select: { id: true, title: true } } }
    });
    res.json({ data: events });
  }));

  // ---------------------------------------------------------------------------
  // Investigations
  // ---------------------------------------------------------------------------

  api.get('/investigations', h(async (req, res) => {
    const q = InvestigationListSchema.parse(req.query);
    const where: Prisma.InvestigationWhereInput = {
      userId: req.user.id,
      archivedAt: q.archived ? { not: null } : null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from ? { createdAt: { gte: q.from } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { targetUrl: { contains: q.q, mode: 'insensitive' } }] } : {})
    };
    const orderBy: Prisma.InvestigationOrderByWithRelationInput =
      q.sort === 'title' ? { title: 'asc' } : q.sort === 'created' ? { createdAt: 'desc' } : { updatedAt: 'desc' };
    const [total, items] = await Promise.all([
      prisma.investigation.count({ where }),
      prisma.investigation.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          experiments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              _count: { select: { findings: true, sessions: true, runs: true } },
              runs: { take: 1, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, completedAt: true } }
            }
          }
        }
      })
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) } });
  }));

  api.post('/investigations', h(async (req, res) => {
    const input = CreateInvestigationSchema.parse(req.body);
    await assertTargetAllowed(input.targetUrl, { permittedDomain: input.permittedDomain, allowedTestHosts: parseAllowList(process.env.ALLOWED_TEST_DOMAINS) });
    const startRun = req.query.run === 'true';
    const userId = req.user.id;

    const created = await prisma.$transaction(async (tx) => {
      const scope = await tx.authorizationScope.create({ data: { permittedDomain: input.permittedDomain, purpose: input.authorizationPurpose } });
      const investigation = await tx.investigation.create({
        data: { userId, title: input.title, description: input.description, targetUrl: input.targetUrl, status: 'ready', authorizationScopeId: scope.id }
      });
      const experiment = await tx.experiment.create({
        data: { investigationId: investigation.id, name: `${input.journey.name} experiment`, configuration: { sessionCount: input.sessions.length } as Prisma.InputJsonValue }
      });
      for (const s of input.sessions) {
        const session = await tx.experimentSession.create({
          data: { experimentId: experiment.id, name: s.name, sessionRole: s.role, configuration: {}, configurationFingerprint: '' }
        });
        const config: SessionConfiguration = { id: session.id, ...s };
        const { id: _omit, name: _name, ...fingerprintable } = config;
        await tx.experimentSession.update({
          where: { id: session.id },
          data: { configuration: config as unknown as Prisma.InputJsonValue, configurationFingerprint: fingerprint(fingerprintable) }
        });
      }
      const journey = await tx.journey.create({ data: { experimentId: experiment.id, name: input.journey.name, version: input.journey.version } });
      await tx.journeyStep.createMany({
        data: input.journey.steps.map((step, sequence) => ({ journeyId: journey.id, sequence, type: step.type, configuration: step as unknown as Prisma.InputJsonValue }))
      });
      await tx.auditEvent.create({
        data: {
          userId,
          investigationId: investigation.id,
          eventType: 'investigation.created',
          metadata: { targetUrl: input.targetUrl, permittedDomain: input.permittedDomain, authorizationAcknowledged: true }
        }
      });
      return { investigation, experiment };
    }, { timeout: 20000 });

    const run = startRun ? await enqueueRun(created.experiment.id) : null;
    res.status(201).json({ data: { ...created.investigation, experimentId: created.experiment.id, runId: run?.id ?? null } });
  }));

  api.get('/investigations/:id', h(async (req, res) => {
    const investigation = await prisma.investigation.findFirst({
      where: ownedInvestigation(req, idParam(req)),
      include: {
        authorizationScope: true,
        experiments: {
          orderBy: { createdAt: 'desc' },
          include: {
            sessions: { orderBy: { createdAt: 'asc' } },
            journeys: { orderBy: { version: 'desc' }, take: 1, include: { steps: { orderBy: { sequence: 'asc' } } } },
            runs: { orderBy: { createdAt: 'desc' }, take: 20, include: { _count: { select: { findings: true, artifacts: true } } } }
          }
        }
      }
    });
    if (!investigation) throw new ApiError(404, 'NOT_FOUND', 'Investigation not found');
    res.json({ data: investigation });
  }));

  api.patch('/investigations/:id', h(async (req, res) => {
    const id = idParam(req);
    const input = UpdateInvestigationSchema.parse(req.body);
    const existing = await prisma.investigation.findFirst({ where: ownedInvestigation(req, id) });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Investigation not found');
    const updated = await prisma.investigation.update({
      where: { id },
      data: { title: input.title, description: input.description, ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }) }
    });
    await audit(req.user.id, 'investigation.updated', input, id);
    res.json({ data: updated });
  }));

  api.delete('/investigations/:id', h(async (req, res) => {
    const id = idParam(req);
    const existing = await prisma.investigation.findFirst({ where: ownedInvestigation(req, id) });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Investigation not found');
    const active = await prisma.executionRun.count({ where: { experiment: { investigationId: id }, status: { in: ACTIVE_RUN_STATUSES } } });
    if (active) throw new ApiError(409, 'RUN_IN_PROGRESS', 'Cancel active runs before deleting.');
    await prisma.$transaction([
      prisma.auditEvent.create({ data: { userId: req.user.id, eventType: 'investigation.deleted', metadata: { investigationId: id, title: existing.title } } }),
      prisma.auditEvent.updateMany({ where: { investigationId: id }, data: { investigationId: null } }),
      prisma.investigation.delete({ where: { id } })
    ]);
    res.status(204).end();
  }));

  // ---------------------------------------------------------------------------
  // Experiments & runs
  // ---------------------------------------------------------------------------

  api.get('/experiments', h(async (req, res) => {
    const q = PageSchema.parse(req.query);
    const where = { investigation: { userId: req.user.id, archivedAt: null } };
    const [total, items] = await Promise.all([
      prisma.experiment.count({ where }),
      prisma.experiment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          investigation: { select: { id: true, title: true, targetUrl: true } },
          journeys: { orderBy: { version: 'desc' }, take: 1, select: { name: true, version: true, _count: { select: { steps: true } } } },
          sessions: { select: { id: true, name: true, sessionRole: true } },
          runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, createdAt: true, completedAt: true } },
          _count: { select: { runs: true, findings: true } }
        }
      })
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) } });
  }));

  api.get('/experiments/:id', h(async (req, res) => {
    const experiment = await prisma.experiment.findFirst({
      where: { id: idParam(req), investigation: { userId: req.user.id } },
      include: {
        investigation: { select: { id: true, title: true, targetUrl: true } },
        sessions: { orderBy: { createdAt: 'asc' } },
        journeys: { orderBy: { version: 'desc' }, take: 1, include: { steps: { orderBy: { sequence: 'asc' } } } }
      }
    });
    if (!experiment) throw new ApiError(404, 'NOT_FOUND', 'Experiment not found');
    res.json({ data: experiment });
  }));

  api.post('/experiments/:id/run', rateLimit(10, 60_000), h(async (req, res) => {
    const id = idParam(req);
    const experiment = await prisma.experiment.findFirst({
      where: { id, investigation: { userId: req.user.id } },
      include: { investigation: { include: { authorizationScope: true } } }
    });
    if (!experiment) throw new ApiError(404, 'NOT_FOUND', 'Experiment not found');
    await assertTargetAllowed(experiment.investigation.targetUrl, {
      permittedDomain: experiment.investigation.authorizationScope.permittedDomain,
      allowedTestHosts: parseAllowList(process.env.ALLOWED_TEST_DOMAINS)
    });
    const run = await enqueueRun(id);
    await prisma.investigation.update({ where: { id: experiment.investigationId }, data: { status: 'queued' } });
    await audit(req.user.id, 'run.queued', { runId: run.id }, experiment.investigationId);
    res.status(202).json({ data: run });
  }));

  api.get('/experiments/:id/runs', h(async (req, res) => {
    const runs = await prisma.executionRun.findMany({
      where: { experimentId: idParam(req), ...runScope(req) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { findings: true, artifacts: true } } }
    });
    res.json({ data: runs });
  }));

  api.get('/runs/:id', h(async (req, res) => {
    const run = await prisma.executionRun.findFirst({
      where: ownedRun(req, idParam(req)),
      include: {
        experiment: {
          include: {
            investigation: { select: { id: true, title: true, targetUrl: true, authorizationScope: true } },
            sessions: { orderBy: { createdAt: 'asc' } },
            journeys: { orderBy: { version: 'desc' }, take: 1, include: { steps: { orderBy: { sequence: 'asc' } } } }
          }
        },
        _count: { select: { findings: true, artifacts: true, observations: true } }
      }
    });
    if (!run) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    res.json({ data: run });
  }));

  api.post('/runs/:id/cancel', h(async (req, res) => {
    const id = idParam(req);
    const run = await prisma.executionRun.findFirst({ where: ownedRun(req, id) });
    if (!run) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) throw new ApiError(409, 'NOT_ACTIVE', `Run is already ${run.status}.`);
    if (run.status === 'queued') {
      const job = await deps.queue.getJob(id);
      const removed = job ? await job.remove().then(() => true, () => false) : true;
      if (removed) {
        const updated = await prisma.executionRun.update({ where: { id }, data: { status: 'cancelled', completedAt: new Date() } });
        return res.json({ data: updated });
      }
    }
    const updated = await prisma.executionRun.update({ where: { id }, data: { status: 'cancelling' } });
    res.status(202).json({ data: updated });
  }));

  api.get('/runs/:id/observations', h(async (req, res) => {
    const observations = await prisma.browserObservation.findMany({
      where: { executionRun: ownedRun(req, idParam(req)) },
      orderBy: { capturedAt: 'asc' },
      include: { artifacts: { select: { id: true, type: true, sha256: true, size: true } } }
    });
    res.json({ data: observations });
  }));

  api.get('/runs/:id/findings', h(async (req, res) => {
    const q = FindingQuerySchema.parse(req.query);
    const findings = await prisma.differenceFinding.findMany({
      where: { executionRun: ownedRun(req, idParam(req)), ...q },
      orderBy: [{ checkpoint: 'asc' }, { createdAt: 'asc' }]
    });
    res.json({ data: findings });
  }));

  api.get('/runs/:id/artifacts', h(async (req, res) => {
    const artifacts = await prisma.evidenceArtifact.findMany({ where: { executionRun: ownedRun(req, idParam(req)) }, orderBy: { createdAt: 'asc' } });
    res.json({ data: artifacts });
  }));

  api.get('/runs/:id/verify', h(async (req, res) => {
    const id = idParam(req);
    const manifestArtifact = await prisma.evidenceArtifact.findFirst({ where: { executionRun: ownedRun(req, id), type: 'manifest' }, orderBy: { createdAt: 'desc' } });
    if (!manifestArtifact) throw new ApiError(404, 'NOT_FOUND', 'This run has no evidence manifest yet.');
    const bytes = await storage.get(manifestArtifact.storageKey);
    const manifestIntact = verifyManifestArtifactSafe(manifestArtifact.sha256, bytes);
    const manifest = JSON.parse(bytes.toString('utf8')) as EvidenceManifest;
    const result = await verifyManifest(manifest, storage);
    res.json({
      data: {
        manifestId: manifestArtifact.id,
        manifestSha256: manifestArtifact.sha256,
        manifestIntact,
        artifacts: manifest.artifacts.length,
        verified: result.verified,
        failed: result.failed,
        verifiedAt: new Date().toISOString()
      }
    });
  }));

  api.get('/runs/:id/report.json', h(async (req, res) => {
    const report = await buildRunReport(prisma, idParam(req), req.user.id);
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="mirror-report-${report.run.id}.json"`);
    res.json(report);
  }));

  api.get('/runs/:id/report.pdf', h(async (req, res) => {
    const report = await buildRunReport(prisma, idParam(req), req.user.id);
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    const pdf = await renderReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mirror-report-${report.run.id}.pdf"`);
    res.send(pdf);
  }));

  // ---------------------------------------------------------------------------
  // Findings (cross-run)
  // ---------------------------------------------------------------------------

  api.get('/findings', h(async (req, res) => {
    const q = FindingListSchema.parse(req.query);
    const where: Prisma.DifferenceFindingWhereInput = {
      ...runScope(req),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.classification ? { classification: q.classification } : {}),
      ...(q.investigationId ? { experiment: { investigationId: q.investigationId, investigation: { userId: req.user.id } } } : {}),
      ...(q.minConfidence !== undefined ? { confidence: { gte: q.minConfidence } } : {}),
      ...(q.from ? { createdAt: { gte: q.from } } : {}),
      ...(q.q ? { description: { contains: q.q, mode: 'insensitive' } } : {})
    };
    const [total, items] = await Promise.all([
      prisma.differenceFinding.count({ where }),
      prisma.differenceFinding.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { experiment: { select: { investigation: { select: { id: true, title: true } }, sessions: { select: { id: true, name: true } } } } }
      })
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) } });
  }));

  api.get('/findings/:id', h(async (req, res) => {
    const finding = await prisma.differenceFinding.findFirst({
      where: { id: idParam(req), experiment: { investigation: { userId: req.user.id } } },
      include: {
        baselineObservation: { include: { artifacts: { select: { id: true, type: true, sha256: true, size: true } } } },
        comparisonObservation: { include: { artifacts: { select: { id: true, type: true, sha256: true, size: true } } } }
      }
    });
    if (!finding) throw new ApiError(404, 'NOT_FOUND', 'Finding not found');
    res.json({ data: finding });
  }));

  // ---------------------------------------------------------------------------
  // Evidence
  // ---------------------------------------------------------------------------

  api.get('/evidence', h(async (req, res) => {
    const q = EvidenceListSchema.parse(req.query);
    const where: Prisma.EvidenceArtifactWhereInput = {
      executionRun: { ...runScope(req), ...(q.investigationId ? { experiment: { investigationId: q.investigationId, investigation: { userId: req.user.id } } } : {}) },
      ...(q.type ? { type: q.type } : {}),
      ...(q.runId ? { executionRunId: q.runId } : {}),
      ...(q.q ? { OR: [{ sha256: { startsWith: q.q.toLowerCase() } }, { storageKey: { contains: q.q } }, { id: { startsWith: q.q.toLowerCase() } }] } : {})
    };
    const [total, items, types] = await Promise.all([
      prisma.evidenceArtifact.count({ where }),
      prisma.evidenceArtifact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          observation: { select: { checkpoint: true } },
          executionRun: { select: { id: true, experiment: { select: { investigation: { select: { id: true, title: true } }, sessions: { select: { id: true, name: true } } } } } }
        }
      }),
      prisma.evidenceArtifact.groupBy({ by: ['type'], where: { executionRun: runScope(req) }, _count: { _all: true } })
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize), types: types.map((t) => ({ type: t.type, count: t._count._all })) } });
  }));

  const ownedArtifact = (req: AuthedRequest, id: string) => prisma.evidenceArtifact.findFirst({ where: { id, executionRun: runScope(req) } });

  api.get('/evidence/:id', h(async (req, res) => {
    const artifact = await ownedArtifact(req, idParam(req));
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', 'Evidence not found');
    res.json({ data: artifact });
  }));

  api.get('/evidence/:id/verify', h(async (req, res) => {
    const artifact = await ownedArtifact(req, idParam(req));
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', 'Evidence not found');
    const bytes = await storage.get(artifact.storageKey).catch(() => null);
    res.json({ data: { id: artifact.id, expected: artifact.sha256, actual: bytes ? computeSha256(bytes) : null, verified: bytes ? verifyManifestArtifactSafe(artifact.sha256, bytes) : false, verifiedAt: new Date().toISOString() } });
  }));

  api.get('/evidence/:id/download', h(async (req, res) => {
    const artifact = await ownedArtifact(req, idParam(req));
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', 'Evidence not found');
    const bytes = await storage.get(artifact.storageKey).catch(() => {
      throw new ApiError(410, 'EVIDENCE_MISSING', 'The stored artifact is no longer available.');
    });
    res.setHeader('X-Content-SHA256', artifact.sha256);
    res.setHeader('X-Evidence-Verified', String(verifyManifestArtifactSafe(artifact.sha256, bytes)));
    res.setHeader('Cache-Control', 'private, max-age=300');
    const filename = artifact.storageKey.split('/').pop() ?? 'artifact';
    const disposition = (name: string) => (req.query.download ? `attachment; filename="${name}"` : 'inline');
    if (artifact.type === 'screenshot') {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', disposition(filename));
    } else if (artifact.type === 'dom_html') {
      // Captured HTML is untrusted target content: never render it on this origin.
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
      res.setHeader('Content-Disposition', disposition(`${filename}.txt`));
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', disposition(filename));
    }
    res.send(bytes);
  }));

  // ---------------------------------------------------------------------------
  // Reports (generated, stored and hashed)
  // ---------------------------------------------------------------------------

  api.post('/reports', h(async (req, res) => {
    const input = CreateReportSchema.parse(req.body);
    const report = await buildRunReport(prisma, input.runId, req.user.id);
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Run not found');
    if (ACTIVE_RUN_STATUSES.includes(report.run.status)) throw new ApiError(409, 'RUN_IN_PROGRESS', 'Wait for the run to finish before generating a report.');
    const run = await prisma.executionRun.findUniqueOrThrow({ where: { id: input.runId }, select: { experimentId: true, experiment: { select: { investigationId: true } } } });
    const bytes = input.format === 'pdf' ? await renderReportPdf(report) : Buffer.from(JSON.stringify(report, null, 2));
    const id = crypto.randomUUID();
    const storageKey = `reports/${req.user.id}/${id}.${input.format}`;
    const stored = await storage.put(storageKey, bytes);
    const record = await prisma.report.create({
      data: {
        id,
        investigationId: run.experiment.investigationId,
        experimentId: run.experimentId,
        executionRunId: input.runId,
        userId: req.user.id,
        format: input.format,
        storageKey,
        sha256: stored.sha256,
        size: stored.size,
        findingCount: report.findings.length,
        artifactCount: report.evidence.length,
        contentDigest: report.reportSha256
      }
    });
    await audit(req.user.id, 'report.generated', { reportId: id, runId: input.runId, format: input.format }, run.experiment.investigationId);
    res.status(201).json({ data: record });
  }));

  api.get('/reports', h(async (req, res) => {
    const q = PageSchema.parse(req.query);
    const where = { userId: req.user.id };
    const [total, items] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { investigation: { select: { id: true, title: true } }, executionRun: { select: { id: true, status: true } } }
      })
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) } });
  }));

  api.get('/reports/:id/download', h(async (req, res) => {
    const report = await prisma.report.findFirst({ where: { id: idParam(req), userId: req.user.id } });
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Report not found');
    const bytes = await storage.get(report.storageKey);
    res.setHeader('X-Content-SHA256', report.sha256);
    res.setHeader('Content-Type', report.format === 'pdf' ? 'application/pdf' : 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mirror-report-${report.executionRunId.slice(0, 8)}-${report.id.slice(0, 8)}.${report.format}"`);
    res.send(bytes);
  }));

  api.get('/audit', h(async (req, res) => {
    const events = await prisma.auditEvent.findMany({
      where: { OR: [{ userId: req.user.id }, { investigation: { userId: req.user.id } }] },
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.json({ data: events });
  }));

  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: err.issues[0]?.message ?? 'Request validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }
      });
    }
    if (err instanceof TargetBlockedError) return res.status(403).json({ error: { code: 'TARGET_BLOCKED', message: err.message } });
    if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
    console.error('[api] unhandled error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return app;
}
