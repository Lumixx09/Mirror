import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileBarChart2, FileJson, FileText, Loader2 } from 'lucide-react';
import { api, reportDownloadUrl } from '../api';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, EvidenceHash, Page, PageHeader, Pagination, Segmented, StatusBadge, TableSkeleton, formatBytes, formatDate, shortId } from '../components/ui';

function GenerateReport() {
  const queryClient = useQueryClient();
  const experiments = useQuery({ queryKey: ['experiments', 1], queryFn: () => api.experiments({ page: 1 }) });
  const runs = (experiments.data?.data ?? []).flatMap((e) => e.runs.filter((r) => ['completed', 'partial'].includes(r.status)).map((r) => ({ run: r, title: e.investigation.title })));
  const [runId, setRunId] = useState('');
  const [format, setFormat] = useState<'pdf' | 'json'>('pdf');
  const selected = runId || runs[0]?.run.id || '';
  const create = useMutation({
    mutationFn: () => api.createReport(selected, format),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] })
  });
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="report-run" className="label">
            Run
          </label>
          <select id="report-run" className="input" value={selected} onChange={(e) => setRunId(e.target.value)} disabled={!runs.length}>
            {runs.length === 0 && <option>No completed runs yet</option>}
            {runs.map(({ run, title }) => (
              <option key={run.id} value={run.id}>
                {title} · run {shortId(run.id)} · {formatDate(run.createdAt)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Format</span>
          <Segmented
            label="Report format"
            value={format}
            onChange={setFormat}
            options={[
              { id: 'pdf', label: <><FileText className="h-3.5 w-3.5" /> PDF</> },
              { id: 'json', label: <><FileJson className="h-3.5 w-3.5" /> JSON</> }
            ]}
          />
        </div>
        {selected && (
          <Link to={`/app/reports/preview/${selected}`} className="btn-secondary">
            <Eye className="h-4 w-4" /> Preview
          </Link>
        )}
        <button className="btn-primary" disabled={!selected || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart2 className="h-4 w-4" />} Generate and store
        </button>
      </div>
      {create.error && <p className="field-error">{(create.error as Error).message}</p>}
      {create.data && <p className="mt-2 text-[12px] text-success">Report generated and stored. SHA-256 {create.data.sha256.slice(0, 16)}…</p>}
    </section>
  );
}

export default function ReportsPage() {
  useBreadcrumbs([{ label: 'Reports' }]);
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const list = useQuery({ queryKey: ['reports', page], queryFn: () => api.reports({ page }), placeholderData: keepPreviousData });

  return (
    <Page>
      <PageHeader title="Reports" description="Generated reports are stored with their own SHA-256 and a digest of the report content, so recipients can verify them independently." />
      <div className="space-y-4 px-6 lg:px-8">
        <GenerateReport />
        <div className="panel">
          {list.isLoading && <TableSkeleton rows={4} cols={6} />}
          {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />}
          {list.data &&
            (list.data.data.length === 0 ? (
              <EmptyState icon={<FileBarChart2 className="h-5 w-5" />} title="No reports generated yet" body="Choose a completed run above to generate a PDF or JSON report." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Investigation</th>
                      <th>Format</th>
                      <th>Run</th>
                      <th>Findings</th>
                      <th>Evidence</th>
                      <th>Generated</th>
                      <th>File SHA-256</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((r) => (
                      <tr key={r.id}>
                        <td className="font-medium">{r.investigation.title}</td>
                        <td>
                          <span className="chip uppercase">{r.format}</span>
                        </td>
                        <td>
                          <Link to={`/app/runs/${r.executionRunId}`} className="flex items-center gap-2 font-mono text-[12px] hover:text-accent">
                            {shortId(r.executionRunId)} <StatusBadge status={r.executionRun.status} subtle />
                          </Link>
                        </td>
                        <td className="mono">{r.findingCount}</td>
                        <td className="mono text-fg-2">{r.artifactCount}</td>
                        <td className="mono text-fg-3">{formatDate(r.createdAt)}</td>
                        <td>
                          <EvidenceHash value={r.sha256} chars={12} />
                          <div className="text-[10.5px] text-fg-3">{formatBytes(r.size)}</div>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <Link to={`/app/reports/preview/${r.executionRunId}`} className="icon-btn h-7 w-7" aria-label="Preview report">
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          <a href={reportDownloadUrl(r.id)} className="icon-btn h-7 w-7" aria-label="Download report">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {list.data && list.data.data.length > 0 && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => setParams({ page: String(p) })} />}
        </div>
      </div>
    </Page>
  );
}
