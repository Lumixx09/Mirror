import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Fingerprint, Search, ShieldCheck, ShieldX, X } from 'lucide-react';
import { api, evidenceUrl, type EvidenceListItem } from '../api';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, EvidenceHash, Modal, Page, PageHeader, Pagination, TableSkeleton, cx, formatBytes, formatDate, shortId } from '../components/ui';

function VerifyCell({ id }: { id: string }) {
  const verify = useMutation({ mutationFn: () => api.verifyArtifact(id) });
  if (verify.data)
    return verify.data.verified ? (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> intact
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-danger" title={`expected ${verify.data.expected}, got ${verify.data.actual ?? 'missing'}`}>
        <ShieldX className="h-3.5 w-3.5" /> mismatch
      </span>
    );
  return (
    <button className="btn-ghost btn-sm h-6 px-1.5 text-[11.5px]" onClick={() => verify.mutate()} disabled={verify.isPending}>
      {verify.isPending ? 'checking…' : 'verify'}
    </button>
  );
}

function Preview({ item, onClose }: { item: EvidenceListItem | null; onClose: () => void }) {
  const isText = item && item.type !== 'screenshot';
  const text = useQuery({ queryKey: ['evidence-text', item?.id], queryFn: () => api.evidenceText(item!.id), enabled: Boolean(isText) });
  return (
    <Modal open={Boolean(item)} onClose={onClose} labelledBy="preview-title" width={960}>
      {item && (
        <>
          <div className="panel-head">
            <div className="min-w-0">
              <h2 id="preview-title" className="panel-title font-mono">
                {item.type} · {shortId(item.id)}
              </h2>
              <div className="truncate font-mono text-[11px] text-fg-3">{item.storageKey}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href={evidenceUrl(item.id, true)} className="btn-secondary btn-sm">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
              <button className="icon-btn" onClick={onClose} aria-label="Close preview">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto bg-bg">
            {item.type === 'screenshot' ? (
              <img src={evidenceUrl(item.id)} alt={`Screenshot ${item.id}`} className="block w-full" />
            ) : text.isLoading ? (
              <p className="p-4 text-[13px] text-fg-3">Loading…</p>
            ) : (
              <pre className="whitespace-pre-wrap break-all p-4 font-mono text-[11.5px] leading-relaxed text-fg-2">{(text.data ?? '').slice(0, 60000)}</pre>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-[11.5px] text-fg-3">
            <EvidenceHash value={item.sha256} label="sha256" chars={0} />
            <span>{formatBytes(item.size)}</span>
            {item.type === 'dom_html' && <span className="text-warning">Untrusted target content, shown as plain text.</span>}
          </div>
        </>
      )}
    </Modal>
  );
}

export default function EvidencePage() {
  useBreadcrumbs([{ label: 'Evidence' }]);
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [q, setQ] = useState(get('q'));
  const [preview, setPreview] = useState<EvidenceListItem | null>(null);
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

  const filters = { page: Number(get('page') || 1), type: get('type') || undefined, investigationId: get('investigation') || undefined, runId: get('runId') || undefined, q: get('q') || undefined };
  const list = useQuery({ queryKey: ['evidence', filters], queryFn: () => api.evidence(filters), placeholderData: keepPreviousData });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const types = list.data?.meta.types ?? [];
  const totalAll = types.reduce((a, t) => a + t.count, 0);

  return (
    <Page>
      <PageHeader title="Evidence" description="Every artifact captured by MIRROR, with its SHA-256 digest. Artifacts are immutable and can be re-verified at any time." />
      <div className="px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Artifact type">
          <button role="radio" aria-checked={!get('type')} onClick={() => update('type', '')} className={cx('chip h-7 cursor-pointer px-2.5', !get('type') && 'border-accent/60 bg-accent/10 text-fg')}>
            all <span className="text-fg-3">{totalAll}</span>
          </button>
          {types.map((t) => (
            <button key={t.type} role="radio" aria-checked={get('type') === t.type} onClick={() => update('type', t.type)} className={cx('chip h-7 cursor-pointer px-2.5', get('type') === t.type && 'border-accent/60 bg-accent/10 text-fg')}>
              {t.type} <span className="text-fg-3">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-3" aria-hidden />
              <input aria-label="Search evidence" className="input pl-8 font-mono" placeholder="sha256 prefix, artifact ID or path" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select aria-label="Investigation" className="input w-auto max-w-[240px]" value={get('investigation')} onChange={(e) => update('investigation', e.target.value)}>
              <option value="">All investigations</option>
              {investigations.data?.data.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            {get('runId') && (
              <button className="chip h-8 cursor-pointer gap-2" onClick={() => update('runId', '')}>
                run {shortId(get('runId'))} <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {list.isLoading && <TableSkeleton rows={8} cols={6} />}
          {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />}
          {list.data &&
            (list.data.data.length === 0 ? (
              <EmptyState icon={<Fingerprint className="h-5 w-5" />} title="No evidence matches" body="Artifacts are captured at every journey checkpoint of a run." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Artifact</th>
                      <th>Investigation</th>
                      <th>Session · checkpoint</th>
                      <th>Captured</th>
                      <th>Size</th>
                      <th>SHA-256</th>
                      <th>Integrity</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className={list.isFetching ? 'opacity-70' : ''}>
                    {list.data.data.map((a) => {
                      const session = a.executionRun.experiment.sessions.find((s) => s.id === a.metadata?.sessionId);
                      return (
                        <tr key={a.id}>
                          <td>
                            <button className="text-left" onClick={() => setPreview(a)}>
                              <span className="block font-mono text-[12px] text-fg hover:text-accent">{a.type}</span>
                              <span className="block font-mono text-[10.5px] text-fg-3">{shortId(a.id)}</span>
                            </button>
                          </td>
                          <td>
                            <Link to={`/app/runs/${a.executionRun.id}`} className="block max-w-[220px] truncate text-fg-2 hover:text-fg">
                              {a.executionRun.experiment.investigation.title}
                            </Link>
                          </td>
                          <td className="text-fg-2">
                            {session?.name ?? '—'}
                            {a.observation?.checkpoint && <span className="font-mono text-[11px] text-fg-3"> · {a.observation.checkpoint}</span>}
                          </td>
                          <td className="mono text-fg-3">{formatDate(a.createdAt)}</td>
                          <td className="mono text-fg-3">{formatBytes(a.size)}</td>
                          <td>
                            <EvidenceHash value={a.sha256} chars={14} />
                          </td>
                          <td>
                            <VerifyCell id={a.id} />
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <a href={evidenceUrl(a.id)} target="_blank" rel="noreferrer" className="icon-btn h-7 w-7" aria-label="Open">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <a href={evidenceUrl(a.id, true)} className="icon-btn h-7 w-7" aria-label="Download">
                              <Download className="h-3.5 w-3.5" />
                            </a>
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
      <Preview item={preview} onClose={() => setPreview(null)} />
    </Page>
  );
}
