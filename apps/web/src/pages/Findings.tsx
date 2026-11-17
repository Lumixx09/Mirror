import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScanSearch, Search, X } from 'lucide-react';
import { api } from '../api';
import { FindingRow } from '../components/findings';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, Page, PageHeader, Pagination, TableSkeleton, humanize } from '../components/ui';

const TYPES = ['price_difference', 'fee_difference', 'subscription_difference', 'default_selection_difference', 'content_difference', 'structure_difference', 'journey_difference', 'navigation_difference', 'unknown_difference'];
const RANGES: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };

export default function FindingsPage() {
  useBreadcrumbs([{ label: 'Findings' }]);
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [q, setQ] = useState(get('q'));
  const investigations = useQuery({ queryKey: ['investigations', 'all-for-filter'], queryFn: () => api.investigations({ page: 1 }) });

  useEffect(() => {
    const t = setTimeout(() => {
      if (get('q') === q) return;
      const next = new URLSearchParams(params);
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters = {
    page: Number(get('page') || 1),
    severity: get('severity') || undefined,
    type: get('type') || undefined,
    classification: get('classification') || undefined,
    investigationId: get('investigation') || undefined,
    minConfidence: get('confidence') ? Number(get('confidence')) : undefined,
    from: get('range') ? new Date(Date.now() - RANGES[get('range')] * 86400000).toISOString() : undefined,
    q: get('q') || undefined
  };
  const list = useQuery({ queryKey: ['findings', filters], queryFn: () => api.findings(filters), placeholderData: keepPreviousData });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const filtered = ['severity', 'type', 'classification', 'investigation', 'confidence', 'range', 'q'].some((k) => get(k));

  return (
    <Page>
      <PageHeader title="Findings" description="Differences discovered by the deterministic engine across all runs. Findings are observations, not judgements of intent." />
      <div className="px-6 lg:px-8">
        <div className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-3" aria-hidden />
              <input aria-label="Search findings" className="input pl-8" placeholder="Search descriptions" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select aria-label="Severity" className="input w-auto" value={get('severity')} onChange={(e) => update('severity', e.target.value)}>
              <option value="">All severities</option>
              {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select aria-label="Category" className="input w-auto" value={get('type')} onChange={(e) => update('type', e.target.value)}>
              <option value="">All categories</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
            <select aria-label="Classification" className="input w-auto" value={get('classification')} onChange={(e) => update('classification', e.target.value)}>
              <option value="">All classifications</option>
              <option value="confirmed_observation">Confirmed observation</option>
              <option value="supported_interpretation">Supported interpretation</option>
              <option value="hypothesis">Hypothesis</option>
            </select>
            <select aria-label="Minimum confidence" className="input w-auto" value={get('confidence')} onChange={(e) => update('confidence', e.target.value)}>
              <option value="">Any confidence</option>
              <option value="0.5">≥ 0.50</option>
              <option value="0.75">≥ 0.75</option>
              <option value="0.85">≥ 0.85</option>
            </select>
            <select aria-label="Investigation" className="input w-auto max-w-[220px]" value={get('investigation')} onChange={(e) => update('investigation', e.target.value)}>
              <option value="">All investigations</option>
              {investigations.data?.data.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <select aria-label="Discovered within" className="input w-auto" value={get('range')} onChange={(e) => update('range', e.target.value)}>
              <option value="">Any time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            {filtered && (
              <button
                className="btn-ghost btn-sm ml-auto"
                onClick={() => {
                  setQ('');
                  setParams(new URLSearchParams());
                }}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
          {list.isLoading && <TableSkeleton rows={6} cols={4} />}
          {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />}
          {list.data &&
            (list.data.data.length === 0 ? (
              <EmptyState icon={<ScanSearch className="h-5 w-5" />} title={filtered ? 'No findings match these filters' : 'No findings yet'} body={filtered ? 'Adjust the filters to widen the result.' : 'Findings are created when a run detects differences between sessions.'} />
            ) : (
              <ul className={list.isFetching ? 'divide-y divide-line opacity-70' : 'divide-y divide-line'}>
                {list.data.data.map((f) => (
                  <li key={f.id}>
                    <FindingRow finding={f} sessionName={(sid) => f.experiment.sessions.find((s) => s.id === sid)?.name ?? sid.slice(0, 8)} investigation={f.experiment.investigation.title} to={`/app/findings/${f.id}`} />
                  </li>
                ))}
              </ul>
            ))}
          {list.data && list.data.data.length > 0 && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => update('page', String(p))} />}
        </div>
      </div>
    </Page>
  );
}
