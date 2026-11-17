import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileJson, FileText, Loader2, Printer } from 'lucide-react';
import { api, runReportUrl } from '../api';
import { MirrorLockup } from '../components/brand';
import { MirrorLoader } from '../components/brand';
import { useBreadcrumbs } from '../components/shell';
import { ClassificationTag, ConfidenceIndicator, ErrorState, EvidenceHash, Page, SeverityBadge, StatusBadge, cx, formatBytes, formatDate, humanize, shortId } from '../components/ui';

export default function ReportPreviewPage() {
  const { runId = '' } = useParams();
  const queryClient = useQueryClient();
  const report = useQuery({ queryKey: ['report-preview', runId], queryFn: () => api.runReport(runId) });
  useBreadcrumbs([{ label: 'Reports', to: '/app/reports' }, { label: `Preview · run ${shortId(runId)}` }]);
  const store = useMutation({ mutationFn: (format: 'pdf' | 'json') => api.createReport(runId, format), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }) });

  if (report.isLoading) return <div className="grid h-full place-items-center"><MirrorLoader label="Building report" /></div>;
  if (report.error) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const r = report.data!;
  const names = (sid: string) => r.experiment.sessions.find((s) => s.id === sid)?.name ?? shortId(sid);

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 lg:px-8 print:hidden">
        <div className="text-[13px] text-fg-2">This preview is generated live from the stored run. Generating stores an immutable, hashed copy.</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </button>
          <a className="btn-secondary" href={runReportUrl(runId, 'json')}>
            <FileJson className="h-4 w-4" /> JSON
          </a>
          <a className="btn-secondary" href={runReportUrl(runId, 'pdf')}>
            <Download className="h-4 w-4" /> PDF
          </a>
          <button className="btn-primary" disabled={store.isPending} onClick={() => store.mutate('pdf')}>
            {store.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Store PDF report
          </button>
        </div>
      </div>
      {store.data && (
        <p className="px-6 pt-2 text-[12px] text-success lg:px-8">
          Stored. <Link to="/app/reports" className="underline">View in reports</Link>
        </p>
      )}

      <article className="mx-6 my-5 overflow-hidden rounded-xl border border-line-strong bg-surface lg:mx-8">
        <header className="relative border-b border-line px-8 py-8">
          <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-accent/40 via-transparent to-transparent" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-6">
            <MirrorLockup height={38} />
            <div className="text-right font-mono text-[11px] text-fg-3">
              <div>Differential testing report v{r.reportVersion}</div>
              <div>generated {formatDate(r.generatedAt)}</div>
            </div>
          </div>
          <h1 className="mt-8 font-display text-[40px] leading-tight">{r.investigation.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-3">
            <StatusBadge status={r.run.status} />
            <span className="font-mono">run {r.run.id}</span>
            <span className="font-mono">{r.investigation.targetUrl}</span>
          </div>
          <p className="mt-5 max-w-3xl border-l-2 border-warning/60 pl-3 text-[12.5px] italic text-fg-2">{r.disclaimer}</p>
        </header>

        <section className="grid gap-px border-b border-line bg-line sm:grid-cols-4">
          {[
            ['Findings', r.summary.findings],
            ['High severity', (r.summary.bySeverity.high ?? 0) + (r.summary.bySeverity.critical ?? 0)],
            ['Sessions', r.experiment.sessions.length],
            ['Evidence artifacts', r.evidence.length]
          ].map(([l, v]) => (
            <div key={l} className="bg-surface px-8 py-4">
              <div className="text-[11px] text-fg-3">{l}</div>
              <div className="font-mono text-[22px]">{v}</div>
            </div>
          ))}
        </section>

        <section className="border-b border-line px-8 py-6">
          <h2 className="eyebrow mb-4">Authorization & conditions</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <dl className="kv">
              <dt>Authorized scope</dt>
              <dd className="mono">{r.investigation.authorization.permittedDomain}</dd>
              <dt>Purpose</dt>
              <dd className="text-fg-2">{r.investigation.authorization.purpose}</dd>
              <dt>Acknowledged</dt>
              <dd className="mono text-fg-2">{formatDate(r.investigation.authorization.acknowledgedAt)}</dd>
              <dt>Journey</dt>
              <dd>
                {r.experiment.journey?.name} v{r.experiment.journey?.version} · {r.experiment.journey?.steps.length} steps
              </dd>
            </dl>
            <table className="table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Conditions</th>
                  <th>Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {r.experiment.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name} <span className={cx('font-mono text-[10px] uppercase', s.role === 'baseline' ? 'text-accent' : 'text-info')}>{s.role}</span>
                    </td>
                    <td className="mono text-fg-2">
                      {s.configuration.locale} · {s.configuration.viewport.width}×{s.configuration.viewport.height}
                      {s.configuration.extraHeaders ? ` · ${Object.entries(s.configuration.extraHeaders).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}
                    </td>
                    <td>
                      <EvidenceHash value={s.configurationFingerprint} chars={10} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-b border-line px-8 py-6">
          <h2 className="eyebrow mb-4">Findings</h2>
          {r.findings.length === 0 ? (
            <p className="text-[13px] text-fg-2">No differences were detected between the sessions.</p>
          ) : (
            <ol className="space-y-4">
              {r.findings.map((f, i) => (
                <li key={f.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                    <SeverityBadge severity={f.severity} />
                    <span className="text-[13px] font-medium">{humanize(f.type)}</span>
                    <span className="font-mono text-[11px] text-fg-3">@{f.checkpoint}</span>
                    <span className="ml-auto flex items-center gap-4">
                      <ClassificationTag value={f.classification} />
                      <ConfidenceIndicator value={f.confidence} />
                    </span>
                  </div>
                  <p className="mt-2 text-[13px]">{f.description}</p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-4 font-mono text-[12px]">
                    <div>
                      <div className="text-[10.5px] uppercase text-accent">{names(f.baselineSessionId)}</div>
                      <div className={cx(!f.details.baseline && 'italic text-fg-3')}>{f.details.baseline?.value?.split('\n')[0] ?? 'absent'}</div>
                      {f.details.baseline?.sourceLocator && <div className="truncate text-[10.5px] text-fg-3">{f.details.baseline.sourceLocator}</div>}
                    </div>
                    <div className="axis-v" aria-hidden />
                    <div>
                      <div className="text-[10.5px] uppercase text-info">{names(f.comparisonSessionId)}</div>
                      <div className={cx(!f.details.comparison && 'italic text-fg-3')}>{f.details.comparison?.value?.split('\n')[0] ?? 'absent'}</div>
                      {f.details.comparison?.sourceLocator && <div className="truncate text-[10.5px] text-fg-3">{f.details.comparison.sourceLocator}</div>}
                    </div>
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] text-fg-3">evidence {f.evidenceReferences.map(shortId).join(', ')} · finding {f.id}</div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="px-8 py-6">
          <h2 className="eyebrow mb-4">Evidence manifest</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>SHA-256</th>
                  <th>Size</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {r.evidence.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.type}</td>
                    <td>
                      <EvidenceHash value={a.sha256} chars={24} />
                    </td>
                    <td className="mono text-fg-3">{formatBytes(a.size)}</td>
                    <td className="max-w-[320px] truncate font-mono text-[11px] text-fg-3">{a.storageKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 rounded-md border border-accent/30 bg-accent/[0.05] px-4 py-3 font-mono text-[11.5px]">
            report content digest <span className="text-accent">{r.reportSha256}</span>
          </div>
        </section>
      </article>
    </Page>
  );
}
