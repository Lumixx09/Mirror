import type {
  DifferenceFindingRecord,
  FindingSeverity,
  FindingType,
  JourneyStep,
  MirrorEvent,
  PageObservation,
  RunStatus,
  SessionConfiguration,
  StepExecutionResult
} from '@mirror/contracts';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ path: string; message: string }>
  ) {
    super(message);
  }
}

/** Invoked on any 401 so the auth layer can return to the sign-in screen. */
let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

async function request<T>(path: string, init?: RequestInit & { allow401?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Mirror-Client': 'web', ...(init?.headers ?? {}) }
    });
  } catch {
    throw new ApiRequestError(0, 'OFFLINE', 'Cannot reach the MIRROR API. Check that it is running.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error ?? {};
    if (res.status === 401 && !init?.allow401) onUnauthenticated?.();
    throw new ApiRequestError(res.status, err.code ?? 'ERROR', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const evidenceUrl = (id: string, download = false) => `${API_BASE}/api/v1/evidence/${id}/download${download ? '?download=1' : ''}`;
export const reportDownloadUrl = (id: string) => `${API_BASE}/api/v1/reports/${id}/download`;
export const runReportUrl = (runId: string, format: 'json' | 'pdf') => `${API_BASE}/api/v1/runs/${runId}/report.${format}${format === 'json' ? '?download=1' : ''}`;

export function wsUrl(): string {
  if (API_BASE) return `${API_BASE.replace(/^http/, 'ws')}/ws`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface Meta {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}
export interface Paginated<T> {
  data: T[];
  meta: Meta;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  _count?: { findings: number; artifacts: number; observations?: number };
}

export interface SessionRecord {
  id: string;
  name: string;
  sessionRole: 'baseline' | 'comparison';
  configuration: SessionConfiguration;
  configurationFingerprint: string;
}

export interface JourneyRecord {
  id: string;
  name: string;
  version: number;
  steps: Array<{ id: string; sequence: number; type: string; configuration: JourneyStep }>;
}

export interface InvestigationListItem {
  id: string;
  title: string;
  targetUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  experiments: Array<{
    id: string;
    _count: { findings: number; sessions: number; runs: number };
    runs: Array<{ id: string; status: RunStatus; createdAt: string; completedAt: string | null }>;
  }>;
}

export interface InvestigationDetail {
  id: string;
  title: string;
  description: string | null;
  targetUrl: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  authorizationScope: { permittedDomain: string; purpose: string; acknowledgedAt: string };
  experiments: Array<{ id: string; name: string; sessions: SessionRecord[]; journeys: JourneyRecord[]; runs: RunSummary[] }>;
}

export interface ExperimentListItem {
  id: string;
  name: string;
  createdAt: string;
  investigation: { id: string; title: string; targetUrl: string };
  journeys: Array<{ name: string; version: number; _count: { steps: number } }>;
  sessions: Array<{ id: string; name: string; sessionRole: string }>;
  runs: Array<{ id: string; status: RunStatus; createdAt: string; completedAt: string | null }>;
  _count: { runs: number; findings: number };
}

export interface SessionRunState {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
  error?: string;
  steps: StepExecutionResult[];
}

export interface RunDetail extends RunSummary {
  experimentId: string;
  workerId: string | null;
  executionMetadata: { attempt?: number; browserVersion?: string; findingCount?: number; durationMs?: number; sessions?: SessionRunState[] } | null;
  experiment: {
    id: string;
    investigation: { id: string; title: string; targetUrl: string; authorizationScope: { permittedDomain: string } };
    sessions: SessionRecord[];
    journeys: JourneyRecord[];
  };
}

export interface ArtifactRef {
  id: string;
  type: string;
  sha256: string;
  size: number;
}

export interface ObservationRecord {
  id: string;
  sessionId: string;
  checkpoint: string;
  capturedAt: string;
  payload: PageObservation;
  artifacts: ArtifactRef[];
}

export interface ArtifactRecord extends ArtifactRef {
  executionRunId: string;
  observationId: string | null;
  storageKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EvidenceListItem extends ArtifactRecord {
  observation: { checkpoint: string } | null;
  executionRun: { id: string; experiment: { investigation: { id: string; title: string }; sessions: Array<{ id: string; name: string }> } };
}

export type FindingRecord = Omit<DifferenceFindingRecord, 'createdAt'> & { createdAt: string };

export interface FindingListItem extends FindingRecord {
  experiment: { investigation: { id: string; title: string }; sessions: Array<{ id: string; name: string }> };
}

export interface FindingDetail extends FindingRecord {
  baselineObservation: (ObservationRecord & { artifacts: ArtifactRef[] }) | null;
  comparisonObservation: (ObservationRecord & { artifacts: ArtifactRef[] }) | null;
}

export interface VerificationResult {
  manifestId: string;
  manifestSha256: string;
  manifestIntact: boolean;
  artifacts: number;
  verified: number;
  failed: Array<{ artifactId: string; storageKey: string; reason: string }>;
  verifiedAt: string;
}

export interface Overview {
  totals: { investigations: number; experiments: number; runs: number; activeRuns: number; findings: number; highFindings: number; artifacts: number };
  findingsByType: Array<{ type: string; count: number }>;
  findingsBySeverity: Array<{ severity: FindingSeverity; count: number }>;
  history: Array<{ date: string; completed: number; partial: number; failed: number; other: number }>;
  health: { window: number; completed: number; partial: number; failed: number; avgDurationMs: number | null };
  activeRuns: Array<RunSummary & { experiment: { investigation: { id: string; title: string } } }>;
  recentRuns: Array<RunSummary & { experiment: { id: string; investigation: { id: string; title: string; targetUrl: string }; _count: { sessions: number } } }>;
  recentFindings: Array<{ id: string; type: string; severity: FindingSeverity; description: string; createdAt: string; runId: string; subject: string; baselineName: string | null; comparisonName: string | null }>;
  activity: AuditEvent[];
  spotlight: null | {
    runId: string;
    investigation: { id: string; title: string; targetUrl: string };
    sessions: number;
    findings: number;
    artifacts: number;
    status: RunStatus;
    checkpoint: string;
    finding: { id: string; type: string; severity: FindingSeverity; subject: string };
    baseline: { name: string; value: string | null; screenshotId: string | null };
    comparison: { name: string; value: string | null; screenshotId: string | null };
  };
}

export interface Settings {
  demoStoreUrl: string | null;
  aiProvider: string | null;
  registrationEnabled: boolean;
  storageDriver: string;
  limits: { maxConcurrency: number; stepTimeoutMs: number; evidenceRetentionDays: number; maxScreenshotMb: number; maxDomSnapshotMb: number };
  allowedTestHosts: string[];
}

export interface AuditEvent {
  id: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  investigationId: string | null;
  investigation?: { id: string; title: string } | null;
}

export interface ReportRecord {
  id: string;
  format: 'json' | 'pdf';
  sha256: string;
  size: number;
  findingCount: number;
  artifactCount: number;
  contentDigest: string;
  createdAt: string;
  executionRunId: string;
  investigation: { id: string; title: string };
  executionRun: { id: string; status: RunStatus };
}

export interface AuthSessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SearchResults {
  investigations: Array<{ id: string; title: string; targetUrl: string; status: string }>;
  findings: Array<{ id: string; type: string; severity: FindingSeverity; description: string; executionRunId: string }>;
  runs: Array<{ id: string; status: RunStatus; createdAt: string }>;
}

export interface CreateInvestigationPayload {
  title: string;
  description?: string;
  targetUrl: string;
  permittedDomain: string;
  authorizationPurpose: string;
  authorizationAcknowledged: boolean;
  sessions: Array<Omit<SessionConfiguration, 'id'>>;
  journey: { name: string; version: number; steps: JourneyStep[] };
}

export type RunReport = {
  reportVersion: number;
  generatedAt: string;
  disclaimer: string;
  reportSha256: string;
  investigation: { id: string; title: string; description: string | null; targetUrl: string; authorization: { permittedDomain: string; purpose: string; acknowledgedAt: string } };
  experiment: {
    id: string;
    name: string;
    journey: { name: string; version: number; steps: JourneyStep[] } | null;
    sessions: Array<{ id: string; name: string; role: string; configuration: SessionConfiguration; configurationFingerprint: string }>;
  };
  run: { id: string; status: RunStatus; startedAt: string | null; completedAt: string | null; error: string | null };
  summary: { findings: number; bySeverity: Record<string, number>; byType: Record<string, number> };
  findings: Array<FindingRecord>;
  evidence: Array<{ id: string; type: string; observationId: string | null; storageKey: string; sha256: string; size: number; createdAt: string }>;
};

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  // auth
  authConfig: () => request<{ data: { registrationEnabled: boolean } }>('/auth/config').then((r) => r.data),
  me: () => request<{ data: User }>('/auth/me', { allow401: true }).then((r) => r.data),
  login: (email: string, password: string) => post<{ data: User }>('/auth/login', { email, password }).then((r) => r.data),
  register: (name: string, email: string, password: string) => post<{ data: User }>('/auth/register', { name, email, password }).then((r) => r.data),
  logout: () => post<void>('/auth/logout'),
  // account
  updateAccount: (name: string) => request<{ data: User }>('/account', { method: 'PATCH', body: JSON.stringify({ name }) }).then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) => post<{ data: { ok: true } }>('/account/password', { currentPassword, newPassword }),
  sessions: () => request<{ data: AuthSessionInfo[] }>('/account/sessions').then((r) => r.data),
  revokeSession: (id: string) => request<void>(`/account/sessions/${id}`, { method: 'DELETE' }),
  // workspace
  overview: () => request<{ data: Overview }>('/overview').then((r) => r.data),
  settings: () => request<{ data: Settings }>('/settings').then((r) => r.data),
  audit: () => request<{ data: AuditEvent[] }>('/audit').then((r) => r.data),
  notifications: () => request<{ data: AuditEvent[] }>('/notifications').then((r) => r.data),
  search: (q: string) => request<{ data: SearchResults }>(`/search${qs({ q })}`).then((r) => r.data),
  health: () =>
    fetch(`${API_BASE}/health`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ status: string; checks: Record<string, string> }>)
      .catch(() => ({ status: 'unreachable', checks: {} as Record<string, string> })),
  // investigations
  investigations: (p: { page?: number; q?: string; status?: string; archived?: boolean; sort?: string; from?: string }) =>
    request<Paginated<InvestigationListItem>>(`/investigations${qs(p)}`),
  investigation: (id: string) => request<{ data: InvestigationDetail }>(`/investigations/${id}`).then((r) => r.data),
  createInvestigation: (payload: CreateInvestigationPayload, run: boolean) =>
    post<{ data: { id: string; experimentId: string; runId: string | null } }>(`/investigations${run ? '?run=true' : ''}`, payload).then((r) => r.data),
  updateInvestigation: (id: string, body: { title?: string; archived?: boolean }) => request<{ data: unknown }>(`/investigations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteInvestigation: (id: string) => request<void>(`/investigations/${id}`, { method: 'DELETE' }),
  // experiments & runs
  experiments: (p: { page?: number }) => request<Paginated<ExperimentListItem>>(`/experiments${qs(p)}`),
  startRun: (experimentId: string) => post<{ data: RunSummary }>(`/experiments/${experimentId}/run`).then((r) => r.data),
  run: (id: string) => request<{ data: RunDetail }>(`/runs/${id}`).then((r) => r.data),
  cancelRun: (id: string) => post<{ data: RunSummary }>(`/runs/${id}/cancel`).then((r) => r.data),
  observations: (id: string) => request<{ data: ObservationRecord[] }>(`/runs/${id}/observations`).then((r) => r.data),
  runFindings: (id: string) => request<{ data: FindingRecord[] }>(`/runs/${id}/findings`).then((r) => r.data),
  artifacts: (id: string) => request<{ data: ArtifactRecord[] }>(`/runs/${id}/artifacts`).then((r) => r.data),
  verify: (id: string) => request<{ data: VerificationResult }>(`/runs/${id}/verify`).then((r) => r.data),
  runReport: (id: string) => request<RunReport>(`/runs/${id}/report.json`),
  // findings & evidence
  findings: (p: { page?: number; severity?: string; type?: string; classification?: string; investigationId?: string; minConfidence?: number; from?: string; q?: string }) =>
    request<Paginated<FindingListItem>>(`/findings${qs(p)}`),
  finding: (id: string) => request<{ data: FindingDetail }>(`/findings/${id}`).then((r) => r.data),
  evidence: (p: { page?: number; type?: string; investigationId?: string; runId?: string; q?: string }) =>
    request<Paginated<EvidenceListItem> & { meta: Meta & { types: Array<{ type: string; count: number }> } }>(`/evidence${qs(p)}`),
  verifyArtifact: (id: string) => request<{ data: { id: string; expected: string; actual: string | null; verified: boolean; verifiedAt: string } }>(`/evidence/${id}/verify`).then((r) => r.data),
  evidenceText: (id: string) =>
    fetch(evidenceUrl(id), { credentials: 'include' }).then((r) => {
      if (!r.ok) throw new ApiRequestError(r.status, 'ERROR', 'Could not load artifact');
      return r.text();
    }),
  // reports
  reports: (p: { page?: number }) => request<Paginated<ReportRecord>>(`/reports${qs(p)}`),
  createReport: (runId: string, format: 'json' | 'pdf') => post<{ data: ReportRecord }>('/reports', { runId, format }).then((r) => r.data)
};

export type { FindingSeverity, FindingType, MirrorEvent, RunStatus, JourneyStep };
