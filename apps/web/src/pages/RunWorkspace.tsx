import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Camera, Download, ExternalLink, FileText, RotateCcw, ShieldCheck, Square } from 'lucide-react';
import type { MirrorEvent } from '@mirror/contracts';
import { api, evidenceUrl, runReportUrl, type FindingRecord, type ObservationRecord, type RunDetail, type SessionRunState } from '../api';
import { BrowserComparison } from '../components/comparison';
import { FindingRow } from '../components/findings';
import { MirrorLoader } from '../components/brand';
import { useBreadcrumbs } from '../components/shell';
import {
  ACTIVE_STATUSES,
  ClassificationTag,
  ConfidenceIndicator,
  EmptyState,
  ErrorState,
  EvidenceHash,
  LoadingState,
  Notice,
  Page,
  SeverityBadge,
  StatusBadge,
  StatusGlyph,
  Tabs,
  cx,
  formatBytes,
  formatDate,
  formatDuration,
  humanize,
  shortId
} from '../components/ui';
import { useRunEvents } from '../components/useMirrorEvents';
import { Stagger, StaggerItem } from '../components/motion';

type Tab = 'comparison' | 'findings' | 'execution' | 'evidence';

function sessionStates(run: RunDetail): SessionRunState[] {
  const meta = run.executionMetadata?.sessions ?? [];
  return run.experiment.sessions.map((s) => meta.find((m) => m.id === s.id) ?? { id: s.id, name: s.name, role: s.sessionRole, status: 'pending', steps: [] });
}

// ---------------------------------------------------------------------------
// Live session lanes
// ---------------------------------------------------------------------------

function SessionLane({ state, run }: { state: SessionRunState; run: RunDetail }) {
  const cfg = run.experiment.sessions.find((s) => s.id === state.id)?.configuration;
  const journey = run.experiment.journeys[0]?.steps ?? [];
  const running = state.status === 'running';
  const current = running ? journey[state.steps.length] : undefined;
  const failed = state.status === 'failed' || state.status === 'blocked';
  return (
    <div className={cx('panel panel-interactive h-full overflow-hidden', state.role === 'baseline' && 'border-accent/40', failed && 'border-danger/50')}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('font-mono text-[10px] uppercase tracking-wider', state.role === 'baseline' ? 'text-accent' : 'text-info')}>{state.role}</span>
            <span className="truncate text-[13.5px] font-semibold">{state.name}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3">
            {cfg?.locale} · {cfg?.timezoneId} · {cfg?.viewport.width}×{cfg?.viewport.height}
            {cfg?.extraHeaders ? ` · ${Object.entries(cfg.extraHeaders).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}
          </div>
        </div>
        <StatusBadge status={state.status} />
      </div>
      <div className="mt-3 flex gap-[3px] px-4" role="progressbar" aria-label={`${state.name} journey progress`} aria-valuemin={0} aria-valuemax={journey.length} aria-valuenow={state.steps.filter((s) => s.status === 'succeeded').length}>
        {journey.map((step, i) => {
          const result = state.steps[i];
          const active = running && i === state.steps.length;
          return (
            <span
              key={step.id}
              title={`${i + 1}. ${step.configuration.description ?? step.type}${result ? ` · ${result.status}` : ''}`}
              className={cx(
                'h-1.5 flex-1 rounded-[2px]',
                result?.status === 'succeeded' && (step.type === 'capture' ? 'bg-accent' : 'bg-accent/60'),
                result?.status === 'failed' && 'bg-danger',
                result?.status === 'skipped' && 'bg-line-strong/50',
                !result && !active && 'bg-line-strong/40',
                active && 'scanline bg-accent/25'
              )}
            />
          );
        })}
      </div>
      <div className="flex min-h-[44px] items-center gap-2 px-4 py-2.5 text-[12px]">
        {failed ? (
          <span className="text-danger">{state.error ?? 'Session failed'}</span>
        ) : current ? (
          <AnimatePresence mode="wait">
            <motion.span key={current.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-fg-2">
              <span className="font-mono text-[11px] text-accent">step {current.sequence + 1}</span> {current.configuration.description ?? current.type}
            </motion.span>
          </AnimatePresence>
        ) : state.status === 'completed' ? (
          <span className="text-fg-3">
            {state.steps.length} steps · {state.steps.filter((s) => s.type === 'capture').length} checkpoints captured
          </span>
        ) : (
          <span className="text-fg-3">Waiting for the worker</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison tab
// ---------------------------------------------------------------------------

function ComparisonTab({ run, observations, findings, sessionStatus }: { run: RunDetail; observations: ObservationRecord[]; findings: FindingRecord[]; sessionStatus: (id: string) => string | undefined }) {
  const baseline = run.experiment.sessions.find((s) => s.sessionRole === 'baseline') ?? run.experiment.sessions[0];
  const comparisons = run.experiment.sessions.filter((s) => s.id !== baseline.id);
  const checkpoints = (run.experiment.journeys[0]?.steps ?? []).filter((s) => s.type === 'capture').map((s) => s.configuration.name!);
  const countFor = (cp: string, sid: string) => findings.filter((f) => f.checkpoint === cp && f.comparisonSessionId === sid && f.severity !== 'info').length;
  const firstWithFinding = (() => {
    for (const s of comparisons) for (const cp of [...checkpoints].reverse()) if (countFor(cp, s.id)) return { cp, sid: s.id };
    return { cp: checkpoints[checkpoints.length - 1], sid: comparisons[0]?.id };
  })();
  const [checkpoint, setCheckpoint] = useState(firstWithFinding.cp);
  const [comparisonId, setComparisonId] = useState(firstWithFinding.sid);
  const [active, setActive] = useState<string | null>(null);
  const comparison = comparisons.find((s) => s.id === comparisonId) ?? comparisons[0];
  const pairFindings = findings.filter((f) => f.checkpoint === checkpoint && f.comparisonSessionId === comparison?.id);
  const selected = pairFindings.find((f) => f.id === active);

  useEffect(() => setActive(null), [checkpoint, comparisonId]);

  if (!comparison) return <EmptyState title="This experiment has no comparison session" />;
  const obs = (sid: string) => observations.find((o) => o.sessionId === sid && o.checkpoint === checkpoint);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="eyebrow mb-1.5">Checkpoint</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Checkpoint">
            {checkpoints.map((cp) => (
              <button key={cp} role="radio" aria-checked={cp === checkpoint} onClick={() => setCheckpoint(cp)} className={cx('chip h-7 cursor-pointer gap-2 px-2.5 transition-colors', cp === checkpoint ? 'border-accent/60 bg-accent/10 text-fg' : 'hover:text-fg')}>
                <Camera className="h-3 w-3" /> {cp}
                {countFor(cp, comparison.id) > 0 && <span className="rounded bg-danger/20 px-1 text-danger">{countFor(cp, comparison.id)}</span>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Compare {baseline.name} with</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comparison session">
            {comparisons.map((s) => (
              <button key={s.id} role="radio" aria-checked={s.id === comparison.id} onClick={() => setComparisonId(s.id)} className={cx('chip h-7 cursor-pointer px-2.5 transition-colors', s.id === comparison.id ? 'border-info/60 bg-info/10 text-fg' : 'hover:text-fg')}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <BrowserComparison baseline={baseline} comparison={comparison} baselineObs={obs(baseline.id)} comparisonObs={obs(comparison.id)} findings={pairFindings} activeFindingId={active} onSelectFinding={setActive} sessionStatus={sessionStatus} />

        <aside className="panel h-fit" aria-label="Differences at this checkpoint">
          <div className="panel-head">
            <span className="panel-title">Differences at “{checkpoint}”</span>
            <span className="font-mono text-[11px] text-fg-3">{pairFindings.length}</span>
          </div>
          {pairFindings.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-3">No differences between these sessions at this checkpoint.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pairFindings.map((f) => (
                <li key={f.id}>
                  <button onClick={() => setActive(f.id === active ? null : f.id)} aria-pressed={f.id === active} className={cx('w-full px-4 py-3 text-left transition-colors', f.id === active ? 'bg-hover' : 'hover:bg-raised/70')}>
                    <div className="flex items-center justify-between gap-2">
                      <SeverityBadge severity={f.severity} />
                      <ConfidenceIndicator value={f.confidence} />
                    </div>
                    <div className="mt-2 text-[12.5px] font-medium">{f.details.subject}</div>
                    <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-[12px]">
                      <span className={cx('truncate', !f.details.baseline && 'italic text-fg-3')}>{f.details.baseline?.value?.split('\n')[0] ?? 'absent'}</span>
                      <span className="h-4 w-px bg-accent/60" aria-hidden />
                      <span className={cx('truncate text-right', !f.details.comparison && 'italic text-fg-3')}>{f.details.comparison?.value?.split('\n')[0] ?? 'absent'}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AnimatePresence>
            {selected && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden border-t border-line">
                <div className="space-y-2 p-4 text-[12.5px]">
                  <p className="text-fg-2">{selected.description}</p>
                  <ClassificationTag value={selected.classification} withNote />
                  <Link to={`/app/findings/${selected.id}`} className="btn-primary btn-sm mt-1 w-full">
                    Open finding inspector <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution & evidence tabs
// ---------------------------------------------------------------------------

function ExecutionTab({ sessions, events }: { sessions: SessionRunState[]; events: MirrorEvent[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {sessions.map((s) => (
          <section key={s.id} className="panel">
            <div className="panel-head">
              <span className="panel-title truncate">{s.name}</span>
              <StatusBadge status={s.status} subtle />
            </div>
            {s.steps.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-fg-3">No steps executed yet.</p>
            ) : (
              <ol className="relative px-4 py-2">
                <span className="absolute bottom-4 left-[23px] top-4 w-px bg-line" aria-hidden />
                {s.steps.map((step) => (
                  <motion.li key={step.sequence} layout initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="relative flex items-start gap-3 py-1.5">
                    <span className="z-10 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong bg-surface">
                      <StatusGlyph status={step.status} className="h-2.5 w-2.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-[12.5px]', step.type === 'capture' ? 'text-accent' : 'text-fg')}>{step.description}</span>
                      {step.error && <span className="block text-[11.5px] text-danger">{step.error}</span>}
                      {step.url && <span className="block truncate font-mono text-[10.5px] text-fg-3">{step.url}</span>}
                    </span>
                    <span className="font-mono text-[10.5px] text-fg-3">{formatDuration(step.durationMs)}</span>
                  </motion.li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
      <section className="panel h-fit" aria-live="polite">
        <div className="panel-head">
          <span className="panel-title">Observation stream</span>
          <span className="text-[11px] text-fg-3">live while open</span>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-fg-3">Worker events for this run appear here in real time.</p>
        ) : (
          <ol className="max-h-[540px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {events.map((e, i) => {
                const p = e.payload as Record<string, unknown> & { step?: { description?: string; status?: string } };
                return (
                  <motion.li key={`${e.timestamp}-${i}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-b border-line/60 px-4 py-2">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className={cx(e.event.includes('failed') ? 'text-danger' : e.event.startsWith('finding') ? 'text-warning' : 'text-accent')}>{e.event}</span>
                      <span className="text-fg-3">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate text-[11.5px] text-fg-3">{String(p.description ?? p.step?.description ?? (p.checkpoint ? `checkpoint ${p.checkpoint}` : '')) || String(p.status ?? '')}</div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}

function EvidenceTab({ run }: { run: RunDetail }) {
  const artifacts = useQuery({ queryKey: ['run', run.id, 'artifacts'], queryFn: () => api.artifacts(run.id) });
  const verify = useMutation({ mutationFn: () => api.verify(run.id) });
  const sessionName = (sid: unknown) => run.experiment.sessions.find((s) => s.id === sid)?.name ?? '—';
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <div className="min-w-[240px] flex-1 text-[13px]">
          <div className="font-medium">Run evidence manifest</div>
          <div className="text-fg-2">Every artifact was hashed with SHA-256 at capture. Verification re-reads the stored bytes and recomputes each hash.</div>
        </div>
        <button className="btn-primary" disabled={verify.isPending || ACTIVE_STATUSES.includes(run.status)} onClick={() => verify.mutate()}>
          {verify.isPending ? 'Verifying…' : 'Verify integrity'}
        </button>
      </div>
      {verify.error && <ErrorState error={verify.error} compact />}
      {verify.data && (
        <Notice tone={verify.data.failed.length === 0 && verify.data.manifestIntact ? 'success' : 'danger'} title={verify.data.failed.length === 0 && verify.data.manifestIntact ? `Verified ${verify.data.verified} of ${verify.data.artifacts} artifacts. Manifest intact.` : `${verify.data.failed.length} artifact(s) failed verification.`}>
          <span className="font-mono text-[11px]">manifest sha256 {verify.data.manifestSha256} · {formatDate(verify.data.verifiedAt)}</span>
        </Notice>
      )}
      <div className="panel overflow-x-auto">
        {artifacts.isLoading ? (
          <LoadingState />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Session</th>
                <th>Checkpoint</th>
                <th>SHA-256</th>
                <th>Size</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {artifacts.data?.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.type}</td>
                  <td className="text-fg-2">{sessionName(a.metadata?.sessionId)}</td>
                  <td className="mono text-fg-2">{String(a.metadata?.checkpoint ?? '—')}</td>
                  <td>
                    <EvidenceHash value={a.sha256} chars={20} />
                  </td>
                  <td className="mono text-fg-3">{formatBytes(a.size)}</td>
                  <td className="whitespace-nowrap text-right">
                    <a href={evidenceUrl(a.id)} target="_blank" rel="noreferrer" className="icon-btn h-7 w-7" aria-label={`Open ${a.type}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <a href={evidenceUrl(a.id, true)} className="icon-btn h-7 w-7" aria-label={`Download ${a.type}`}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunWorkspacePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState<MirrorEvent[]>([]);
  useRunEvents(id, (e) => setEvents((prev) => [e, ...prev].slice(0, 300)));

  const run = useQuery({ queryKey: ['run', id], queryFn: () => api.run(id), refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.includes(q.state.data.status) ? 3000 : false) });
  const active = run.data ? ACTIVE_STATUSES.includes(run.data.status) : false;
  const findings = useQuery({ queryKey: ['run', id, 'findings'], queryFn: () => api.runFindings(id), refetchInterval: active ? 4000 : false });
  const observations = useQuery({ queryKey: ['run', id, 'observations'], queryFn: () => api.observations(id), refetchInterval: active ? 4000 : false });
  const [tab, setTab] = useState<Tab | null>(null);
  const currentTab: Tab = tab ?? (active || run.data?.status === 'failed' || run.data?.status === 'blocked' ? 'execution' : 'comparison');

  useBreadcrumbs([
    { label: 'Investigations', to: '/app/investigations' },
    { label: run.data?.experiment.investigation.title ?? 'Investigation', to: run.data ? `/app/investigations/${run.data.experiment.investigation.id}` : undefined },
    { label: `Run ${shortId(id)}` }
  ]);

  const cancel = useMutation({ mutationFn: () => api.cancelRun(id), onSuccess: () => void run.refetch() });
  const rerun = useMutation({ mutationFn: () => api.startRun(run.data!.experimentId), onSuccess: (r) => { setEvents([]); setTab(null); navigate(`/app/runs/${r.id}`); } });

  const sessions = useMemo(() => (run.data ? sessionStates(run.data) : []), [run.data]);
  if (run.isLoading) return <div className="grid h-full place-items-center"><MirrorLoader label="Loading run" /></div>;
  if (run.error) return <ErrorState error={run.error} onRetry={() => void run.refetch()} />;
  const r = run.data!;
  const f = findings.data ?? [];
  const high = f.filter((x) => x.severity === 'high' || x.severity === 'critical').length;

  return (
    <Page>
      <header className="px-6 pb-4 pt-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-[22px] font-semibold tracking-[-0.015em]">{r.experiment.investigation.title}</h1>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-3">
              <span className="font-mono">run {shortId(r.id)}</span>
              <span>started {formatDate(r.startedAt ?? r.createdAt)}</span>
              <span>{r.experiment.sessions.length} sessions</span>
              <span>{r.experiment.journeys[0]?.steps.length ?? 0} journey steps</span>
              {r.executionMetadata?.durationMs !== undefined && <span>duration {formatDuration(r.executionMetadata.durationMs)}</span>}
              {r.executionMetadata?.browserVersion && <span className="font-mono">chromium {r.executionMetadata.browserVersion}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {active ? (
              <button className="btn-danger" disabled={cancel.isPending || r.status === 'cancelling'} onClick={() => cancel.mutate()}>
                <Square className="h-3.5 w-3.5" /> {r.status === 'cancelling' ? 'Cancelling…' : 'Cancel run'}
              </button>
            ) : (
              <>
                <button className="btn-secondary" disabled={rerun.isPending} onClick={() => rerun.mutate()}>
                  <RotateCcw className="h-4 w-4" /> Rerun
                </button>
                <a className="btn-secondary" href={runReportUrl(r.id, 'json')}>
                  <Download className="h-4 w-4" /> JSON
                </a>
                <Link to={`/app/reports/preview/${r.id}`} className="btn-primary">
                  <FileText className="h-4 w-4" /> Report
                </Link>
              </>
            )}
          </div>
        </div>
        {(rerun.error || cancel.error) && <div className="mt-3"><ErrorState error={rerun.error ?? cancel.error} compact /></div>}
        {r.error && !active && (
          <div className="mt-3">
            <Notice tone={r.status === 'partial' ? 'warning' : 'danger'} title={r.status === 'partial' ? 'Partial run: some sessions did not complete' : 'Run did not complete'}>
              {r.error}
            </Notice>
          </div>
        )}
        {!active && r.status !== 'failed' && (
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
            {[
              ['Findings', f.length],
              ['High severity', high],
              ['Observations', r._count?.observations ?? 0],
              ['Evidence artifacts', r._count?.artifacts ?? 0]
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <div className="text-[11px] text-fg-3">{label}</div>
                <div className={cx('font-mono text-[20px]', label === 'High severity' && Number(value) > 0 && 'text-danger')}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </header>

      <Stagger as="section" inView={false} gap={0.08} className="grid gap-3 px-6 pb-5 sm:grid-cols-2 lg:px-8 xl:grid-cols-3">
        {sessions.map((s) => (
          <StaggerItem key={s.id}>
            <SessionLane state={s} run={r} />
          </StaggerItem>
        ))}
      </Stagger>

      <Tabs<Tab>
        value={currentTab}
        onChange={setTab}
        tabs={[
          { id: 'comparison', label: 'Comparison' },
          { id: 'findings', label: 'Findings', count: f.length },
          { id: 'execution', label: 'Execution timeline' },
          { id: 'evidence', label: 'Evidence', count: r._count?.artifacts }
        ]}
      />
      <div className="px-6 py-5 lg:px-8">
        <AnimatePresence mode="wait">
          <motion.div key={currentTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {currentTab === 'comparison' &&
              (observations.data && observations.data.length > 0 ? (
                <ComparisonTab run={r} observations={observations.data} findings={f} sessionStatus={(sid) => sessions.find((s) => s.id === sid)?.status} />
              ) : (
                <div className="panel">
                  <EmptyState title={active ? 'Waiting for the first checkpoint' : 'No observations captured'} body={active ? 'Captured pages appear here as soon as sessions reach a checkpoint.' : 'Open the execution timeline to see where the journey stopped.'} />
                </div>
              ))}
            {currentTab === 'findings' &&
              (f.length === 0 ? (
                <div className="panel">
                  <EmptyState title={active ? 'Comparison runs after all sessions finish' : 'No differences detected'} body={active ? undefined : 'Every compared checkpoint produced equivalent commercial values, defaults, destinations and visible text.'} />
                </div>
              ) : (
                <ul className="panel divide-y divide-line overflow-hidden">
                  {[...f]
                    .sort((a, b) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity))
                    .map((x) => (
                      <li key={x.id}>
                        <FindingRow finding={x} sessionName={(sid) => r.experiment.sessions.find((s) => s.id === sid)?.name ?? shortId(sid)} to={`/app/findings/${x.id}`} />
                      </li>
                    ))}
                </ul>
              ))}
            {currentTab === 'execution' && <ExecutionTab sessions={sessions} events={events} />}
            {currentTab === 'evidence' && <EvidenceTab run={r} />}
          </motion.div>
        </AnimatePresence>
        {currentTab === 'findings' && f.length > 0 && <p className="mt-3 text-[11.5px] text-fg-3">Types observed: {Array.from(new Set(f.map((x) => humanize(x.type)))).join(', ')}.</p>}
      </div>
    </Page>
  );
}
