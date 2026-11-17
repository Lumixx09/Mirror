import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, FolderSearch, MoreHorizontal, Play, Plus, Search, X } from 'lucide-react';
import { api, type InvestigationListItem } from '../api';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, Page, PageHeader, Pagination, Popover, StatusBadge, TableSkeleton, formatRelative, hostOf } from '../components/ui';

const STATUSES = ['ready', 'queued', 'running', 'completed', 'partial', 'failed', 'blocked', 'cancelled'];
const RANGES: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };

function RowActions({ inv }: { inv: InvestigationListItem }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exp = inv.experiments[0];
  const run = useMutation({ mutationFn: () => api.startRun(exp!.id), onSuccess: (r) => navigate(`/app/runs/${r.id}`) });
  const archive = useMutation({
    mutationFn: () => api.updateInvestigation(inv.id, { archived: !inv.archivedAt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigations'] })
  });
  return (
    <Popover
      label={`Actions for ${inv.title}`}
      width={200}
      trigger={({ toggle, open }) => (
        <button className="icon-btn h-7 w-7" onClick={toggle} aria-expanded={open} aria-label={`Actions for ${inv.title}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          {exp && (
            <button className="flex h-8 w-full items-center gap-2 rounded px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-50" disabled={run.isPending} onClick={() => run.mutate()}>
              <Play className="h-3.5 w-3.5" /> Run experiment
            </button>
          )}
          <button
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-fg"
            onClick={() => {
              archive.mutate();
              close();
            }}
          >
            {inv.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {inv.archivedAt ? 'Restore' : 'Archive'}
          </button>
          {run.error && <p className="px-2 py-1 text-[11.5px] text-danger">{(run.error as Error).message}</p>}
        </div>
      )}
    </Popover>
  );
}

export default function InvestigationsPage() {
  useBreadcrumbs([{ label: 'Investigations' }]);
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? 'updated';
  const range = params.get('range') ?? '';
  const archived = params.get('archived') === 'true';
  const [q, setQ] = useState(params.get('q') ?? '');

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') === q) return;
      const next = new URLSearchParams(params);
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, setParams]);

  const from = range ? new Date(Date.now() - RANGES[range] * 86400000).toISOString() : undefined;
  const list = useQuery({
    queryKey: ['investigations', { page, status, q: params.get('q') ?? '', archived, sort, range }],
    queryFn: () => api.investigations({ page, status: status || undefined, q: params.get('q') ?? undefined, archived, sort, from }),
    placeholderData: keepPreviousData
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const filtered = Boolean(params.get('q') || status || range || archived);

  return (
    <Page>
      <PageHeader
        title="Investigations"
        description="Each investigation holds an authorized target, its browser sessions and journey, and every run."
        actions={
          <Link to="/app/investigations/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New investigation
          </Link>
        }
      />
      <div className="px-6 lg:px-8">
        <div className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative w-full sm:w-72">
              <label htmlFor="inv-search" className="sr-only">
                Search investigations
              </label>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-3" aria-hidden />
              <input id="inv-search" className="input pl-8" placeholder="Search by title or target URL" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select aria-label="Status" className="input w-auto" value={status} onChange={(e) => update('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select aria-label="Created within" className="input w-auto" value={range} onChange={(e) => update('range', e.target.value)}>
              <option value="">Any time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <select aria-label="Sort" className="input w-auto" value={sort} onChange={(e) => update('sort', e.target.value === 'updated' ? '' : e.target.value)}>
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
            <label className="flex items-center gap-2 px-1 text-[12.5px] text-fg-2">
              <input type="checkbox" checked={archived} onChange={(e) => update('archived', e.target.checked ? 'true' : '')} className="accent-[rgb(var(--accent))]" />
              Archived
            </label>
            {filtered && (
              <button
                className="btn-ghost btn-sm ml-auto"
                onClick={() => {
                  setQ('');
                  setParams(new URLSearchParams());
                }}
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>

          {list.isLoading && <TableSkeleton />}
          {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />}
          {list.data &&
            (list.data.data.length === 0 ? (
              <EmptyState
                icon={<FolderSearch className="h-5 w-5" />}
                title={filtered ? 'No investigations match these filters' : 'No investigations yet'}
                body={filtered ? 'Adjust or clear the filters to see more results.' : 'Create an investigation to compare how a site behaves under different browsing conditions.'}
                action={
                  !filtered && (
                    <Link to="/app/investigations/new" className="btn-primary">
                      New investigation
                    </Link>
                  )
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Investigation</th>
                      <th>Target domain</th>
                      <th>Sessions</th>
                      <th>Findings</th>
                      <th>Last execution</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className={list.isFetching ? 'opacity-70 transition-opacity' : ''}>
                    {list.data.data.map((inv) => {
                      const exp = inv.experiments[0];
                      const last = exp?.runs[0];
                      return (
                        <tr key={inv.id}>
                          <td>
                            <Link to={`/app/investigations/${inv.id}`} className="font-medium hover:text-accent">
                              {inv.title}
                            </Link>
                            <div className="text-[11px] text-fg-3">created {formatRelative(inv.createdAt)}</div>
                          </td>
                          <td className="mono text-fg-2">{hostOf(inv.targetUrl)}</td>
                          <td className="mono text-fg-2">{exp?._count.sessions ?? 0}</td>
                          <td className="mono text-fg-2">{exp?._count.findings ?? 0}</td>
                          <td className="text-fg-2">
                            {last ? (
                              <Link to={`/app/runs/${last.id}`} className="hover:text-fg">
                                {formatRelative(last.createdAt)}
                              </Link>
                            ) : (
                              <span className="text-fg-3">never</span>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="w-10 text-right">
                            <RowActions inv={inv} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          {list.data && list.data.data.length > 0 && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => update('page', String(p))} />}
        </div>
      </div>
    </Page>
  );
}
