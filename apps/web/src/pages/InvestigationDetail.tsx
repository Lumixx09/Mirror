import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Camera, Play, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api';
import { describeStep } from '../components/journey';
import { useBreadcrumbs } from '../components/shell';
import { ConfirmDialog, EmptyState, ErrorState, EvidenceHash, LoadingState, Page, PageHeader, StatusBadge, cx, formatDate, formatDuration, formatRelative, hostOf, shortId } from '../components/ui';

export default function InvestigationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inv = useQuery({ queryKey: ['investigation', id], queryFn: () => api.investigation(id) });
  useBreadcrumbs([{ label: 'Investigations', to: '/app/investigations' }, { label: inv.data?.title ?? 'Investigation' }]);

  const run = useMutation({ mutationFn: (experimentId: string) => api.startRun(experimentId), onSuccess: (r) => navigate(`/app/runs/${r.id}`) });
  const archive = useMutation({ mutationFn: (archived: boolean) => api.updateInvestigation(id, { archived }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigation', id] }) });
  const remove = useMutation({ mutationFn: () => api.deleteInvestigation(id), onSuccess: () => navigate('/app/investigations') });

  if (inv.isLoading) return <LoadingState label="Loading investigation" />;
  if (inv.error) return <ErrorState error={inv.error} onRetry={() => void inv.refetch()} />;
  const data = inv.data!;
  const exp = data.experiments[0];
  const journey = exp?.journeys[0];
  const baseline = exp?.sessions.find((s) => s.sessionRole === 'baseline');

  return (
    <Page>
      <PageHeader
        title={data.title}
        description={data.description ?? undefined}
        meta={
          <>
            <StatusBadge status={data.status} />
            <span className="font-mono">{data.targetUrl}</span>
            <span>created {formatRelative(data.createdAt)}</span>
            {data.archivedAt && <span className="text-warning">archived</span>}
          </>
        }
        actions={
          <>
            <button className="btn-ghost" onClick={() => archive.mutate(!data.archivedAt)}>
              {data.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {data.archivedAt ? 'Restore' : 'Archive'}
            </button>
            <button className="btn-ghost hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            {exp && (
              <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate(exp.id)}>
                <Play className="h-4 w-4" /> {exp.runs.length ? 'Rerun experiment' : 'Run experiment'}
              </button>
            )}
          </>
        }
      />
      {(run.error || remove.error) && <ErrorState error={run.error ?? remove.error} />}

      <div className="grid gap-4 px-6 lg:px-8 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Runs</span>
              <span className="text-[11px] text-fg-3">{exp?.runs.length ?? 0} total</span>
            </div>
            {!exp || exp.runs.length === 0 ? (
              <EmptyState title="Not executed yet" body="Run the experiment to execute the journey in every session." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Status</th>
                      <th>Findings</th>
                      <th>Evidence</th>
                      <th>Duration</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.runs.map((r) => (
                      <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/app/runs/${r.id}`)}>
                        <td>
                          <Link to={`/app/runs/${r.id}`} className="font-mono text-[12px] hover:text-accent" onClick={(e) => e.stopPropagation()}>
                            {shortId(r.id)}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="mono">{r._count?.findings ?? 0}</td>
                        <td className="mono text-fg-2">{r._count?.artifacts ?? 0}</td>
                        <td className="mono text-fg-2">{r.startedAt && r.completedAt ? formatDuration(new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) : '—'}</td>
                        <td className="text-fg-3">{formatDate(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {exp && (
            <section className="panel">
              <div className="panel-head">
                <span className="panel-title">Browser sessions</span>
                <span className="text-[11px] text-fg-3">differences from baseline highlighted</span>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Locale</th>
                      <th>Timezone</th>
                      <th>Viewport</th>
                      <th>Headers</th>
                      <th>Fingerprint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.sessions.map((s) => {
                      const c = s.configuration;
                      const b = baseline?.configuration;
                      const diff = (v: unknown, w: unknown) => s.id !== baseline?.id && JSON.stringify(v) !== JSON.stringify(w);
                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="font-medium">{s.name}</div>
                            <div className={cx('font-mono text-[10px] uppercase tracking-wider', s.sessionRole === 'baseline' ? 'text-accent' : 'text-info')}>{s.sessionRole}</div>
                          </td>
                          <td className={cx('mono', diff(c.locale, b?.locale) && 'text-accent')}>{c.locale}</td>
                          <td className={cx('mono', diff(c.timezoneId, b?.timezoneId) && 'text-accent')}>{c.timezoneId}</td>
                          <td className={cx('mono', diff(c.viewport, b?.viewport) && 'text-accent')}>
                            {c.viewport.width}×{c.viewport.height}
                          </td>
                          <td className={cx('mono', diff(c.extraHeaders, b?.extraHeaders) && 'text-accent')}>
                            {c.extraHeaders ? Object.entries(c.extraHeaders).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}
                          </td>
                          <td>
                            <EvidenceHash value={s.configurationFingerprint} chars={10} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="panel-title">Authorization</span>
            </div>
            <dl className="kv">
              <dt>Scope</dt>
              <dd className="mono">{data.authorizationScope.permittedDomain}</dd>
              <dt>Target host</dt>
              <dd className="mono">{hostOf(data.targetUrl)}</dd>
              <dt>Purpose</dt>
              <dd className="text-fg-2">{data.authorizationScope.purpose}</dd>
              <dt>Recorded</dt>
              <dd className="mono text-fg-2">{formatDate(data.authorizationScope.acknowledgedAt)}</dd>
            </dl>
          </section>
          {journey && (
            <section className="panel p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="panel-title">{journey.name}</span>
                <span className="font-mono text-[11px] text-fg-3">v{journey.version}</span>
              </div>
              <ol className="relative space-y-2">
                <span className="absolute bottom-2 left-[9px] top-2 w-px bg-line" aria-hidden />
                {journey.steps.map((s) => (
                  <li key={s.id} className="relative flex items-start gap-3 text-[12.5px]">
                    <span className={cx('z-10 grid h-[19px] w-[19px] shrink-0 place-items-center rounded border font-mono text-[9.5px]', s.type === 'capture' ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line-strong bg-surface text-fg-3')}>
                      {s.type === 'capture' ? <Camera className="h-2.5 w-2.5" /> : s.sequence + 1}
                    </span>
                    <span className={s.type === 'capture' ? 'text-accent' : 'text-fg-2'}>{describeStep(s.configuration)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={remove.isPending}
        title="Delete investigation?"
        body="This permanently removes the investigation, its runs, observations and findings. Stored evidence files are retained until retention cleanup. The deletion is recorded in the audit log."
        confirmLabel="Delete investigation"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
      />
    </Page>
  );
}
