import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, Play, Plus } from 'lucide-react';
import { api } from '../api';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, Page, PageHeader, Pagination, StatusBadge, TableSkeleton, cx, formatRelative, hostOf } from '../components/ui';

function RunButton({ experimentId, disabled }: { experimentId: string; disabled: boolean }) {
  const navigate = useNavigate();
  const run = useMutation({ mutationFn: () => api.startRun(experimentId), onSuccess: (r) => navigate(`/app/runs/${r.id}`) });
  return (
    <button className="btn-secondary btn-sm" disabled={disabled || run.isPending} onClick={() => run.mutate()} title={run.error ? (run.error as Error).message : undefined}>
      <Play className="h-3.5 w-3.5" /> Run
    </button>
  );
}

export default function ExperimentsPage() {
  useBreadcrumbs([{ label: 'Experiments' }]);
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const list = useQuery({ queryKey: ['experiments', page], queryFn: () => api.experiments({ page }), placeholderData: keepPreviousData, refetchInterval: 15_000 });

  return (
    <Page>
      <PageHeader
        title="Experiments"
        description="An experiment is a fixed set of browser sessions and a versioned journey. Each execution is a run."
        actions={
          <Link to="/app/investigations/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New investigation
          </Link>
        }
      />
      <div className="px-6 lg:px-8">
        <div className="panel">
          {list.isLoading && <TableSkeleton />}
          {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />}
          {list.data &&
            (list.data.data.length === 0 ? (
              <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No experiments yet" body="Experiments are created with each investigation." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Experiment</th>
                      <th>Sessions</th>
                      <th>Journey</th>
                      <th>Runs</th>
                      <th>Findings</th>
                      <th>Latest run</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((e) => {
                      const last = e.runs[0];
                      const active = last && ['queued', 'starting', 'running', 'analysing', 'cancelling'].includes(last.status);
                      return (
                        <tr key={e.id}>
                          <td>
                            <Link to={`/app/investigations/${e.investigation.id}`} className="font-medium hover:text-accent">
                              {e.investigation.title}
                            </Link>
                            <div className="font-mono text-[11px] text-fg-3">{hostOf(e.investigation.targetUrl)}</div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {e.sessions.map((s) => (
                                <span key={s.id} className={cx('chip h-5', s.sessionRole === 'baseline' && 'border-accent/40 text-accent')}>
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-fg-2">
                            {e.journeys[0]?.name ?? '—'} <span className="font-mono text-[11px] text-fg-3">· {e.journeys[0]?._count.steps ?? 0} steps</span>
                          </td>
                          <td className="mono">{e._count.runs}</td>
                          <td className="mono">{e._count.findings}</td>
                          <td>
                            {last ? (
                              <Link to={`/app/runs/${last.id}`} className="flex items-center gap-2 hover:text-fg">
                                <StatusBadge status={last.status} subtle />
                                <span className="text-[11.5px] text-fg-3">{formatRelative(last.createdAt)}</span>
                              </Link>
                            ) : (
                              <span className="text-fg-3">never</span>
                            )}
                          </td>
                          <td className="text-right">
                            <RunButton experimentId={e.id} disabled={Boolean(active)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          {list.data && list.data.data.length > 0 && (
            <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => setParams({ page: String(p) })} />
          )}
        </div>
      </div>
    </Page>
  );
}
