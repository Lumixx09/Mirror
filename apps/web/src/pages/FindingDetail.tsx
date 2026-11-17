import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, ExternalLink, FileCode2, FlaskConical, Info, Network, RotateCcw } from 'lucide-react';
import type { NetworkRequestObservation } from '@mirror/contracts';
import { api, evidenceUrl, type ArtifactRef, type ObservationRecord, type RunDetail } from '../api';
import { BrowserViewport, highlightsFor } from '../components/comparison';
import { alternativeExplanations, confirmationExperiments, reproductionSteps } from '../components/findings';
import { MirrorLoader } from '../components/brand';
import { useBreadcrumbs } from '../components/shell';
import { ClassificationTag, ConfidenceIndicator, ErrorState, EvidenceHash, Notice, Page, SeverityBadge, cx, formatBytes, formatDate, humanize, shortId } from '../components/ui';

function Section({ n, title, children, aside, tone }: { n: number; title: string; children: ReactNode; aside?: ReactNode; tone?: 'guidance' }) {
  return (
    <section className={cx('panel', tone === 'guidance' && 'border-dashed')} aria-labelledby={`sec-${n}`}>
      <div className="panel-head">
        <h2 id={`sec-${n}`} className="panel-title flex items-center gap-2">
          <span className="font-mono text-[11px] text-fg-3">{String(n).padStart(2, '0')}</span> {title}
        </h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ObservationCard({ label, role, obs, run, sessionId }: { label: string; role: 'baseline' | 'comparison'; obs: ObservationRecord | null; run?: RunDetail; sessionId: string }) {
  const session = run?.experiment.sessions.find((s) => s.id === sessionId);
  const cfg = session?.configuration;
  return (
    <div className={cx('rounded-lg border p-4', role === 'baseline' ? 'border-accent/40' : 'border-info/40')}>
      <div className={cx('eyebrow', role === 'baseline' ? 'text-accent' : 'text-info')}>{label}</div>
      <div className="mt-1 text-[14px] font-semibold">{session?.name ?? shortId(sessionId)}</div>
      <dl className="kv mt-3 text-[12.5px]">
        <dt>Observation</dt>
        <dd>{obs ? <EvidenceHash value={obs.id} chars={13} /> : <span className="text-fg-3">not captured</span>}</dd>
        <dt>URL</dt>
        <dd className="mono break-all text-fg-2">{obs?.payload.url ?? '—'}</dd>
        <dt>Captured</dt>
        <dd className="mono text-fg-2">{formatDate(obs?.capturedAt)}</dd>
        <dt>Conditions</dt>
        <dd className="mono text-fg-2">
          {cfg ? `${cfg.locale} · ${cfg.timezoneId} · ${cfg.viewport.width}×${cfg.viewport.height}${cfg.extraHeaders ? ` · ${Object.entries(cfg.extraHeaders).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}` : '—'}
        </dd>
        <dt>Fingerprint</dt>
        <dd>{session ? <EvidenceHash value={session.configurationFingerprint} chars={16} /> : '—'}</dd>
      </dl>
    </div>
  );
}

function NetworkSection({ runId, sessionIds, names, checkpointUrls }: { runId: string; sessionIds: string[]; names: (id: string) => string; checkpointUrls: string[] }) {
  const artifacts = useQuery({ queryKey: ['run', runId, 'artifacts'], queryFn: () => api.artifacts(runId) });
  const network = artifacts.data?.filter((a) => a.type === 'network_json' && sessionIds.includes(String(a.metadata?.sessionId)));
  const logs = useQuery({
    queryKey: ['network', runId, network?.map((n) => n.id).join(',')],
    enabled: Boolean(network?.length),
    queryFn: async () => Promise.all(network!.map(async (n) => ({ sessionId: String(n.metadata?.sessionId), artifact: n, requests: JSON.parse(await api.evidenceText(n.id)) as NetworkRequestObservation[] })))
  });
  const paths = checkpointUrls.map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  });
  if (artifacts.isLoading || logs.isLoading) return <p className="text-[12.5px] text-fg-3">Loading network observations…</p>;
  if (!logs.data?.length) return <p className="text-[12.5px] text-fg-3">No network metadata was recorded for these sessions.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {logs.data.map((l) => {
        const docs = l.requests.filter((r) => r.resourceType === 'document');
        const relevant = docs.filter((r) => paths.some((p) => r.url.includes(p)));
        return (
          <div key={l.sessionId} className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="font-medium">{names(l.sessionId)}</span>
              <a href={evidenceUrl(l.artifact.id)} target="_blank" rel="noreferrer" className="text-fg-3 hover:text-fg">
                {l.requests.length} requests <ExternalLink className="inline h-3 w-3" />
              </a>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line font-mono text-[11px]">
              {(relevant.length ? relevant : docs).slice(0, 8).map((r, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="text-fg-3">{r.method}</span>
                  <span className={cx('w-8', r.status && r.status >= 400 ? 'text-danger' : 'text-success')}>{r.status ?? '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-2" title={r.url}>
                    {r.url}
                  </span>
                  <span className="text-fg-3">{r.durationMs ?? '—'}ms</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function FindingDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const finding = useQuery({ queryKey: ['finding', id], queryFn: () => api.finding(id) });
  const runId = finding.data?.executionRunId;
  const run = useQuery({ queryKey: ['run', runId], queryFn: () => api.run(runId!), enabled: Boolean(runId) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const all = useQuery({ queryKey: ['run', runId, 'findings'], queryFn: () => api.runFindings(runId!), enabled: Boolean(runId) });
  const rerun = useMutation({ mutationFn: () => api.startRun(run.data!.experimentId), onSuccess: (r) => navigate(`/app/runs/${r.id}`) });

  useBreadcrumbs([
    { label: 'Findings', to: '/app/findings' },
    { label: run.data?.experiment.investigation.title ?? 'Investigation', to: run.data ? `/app/runs/${run.data.id}` : undefined },
    { label: `Finding ${shortId(id)}` }
  ]);

  if (finding.isLoading) return <div className="grid h-full place-items-center"><MirrorLoader label="Loading finding" /></div>;
  if (finding.error) return <ErrorState error={finding.error} onRetry={() => void finding.refetch()} />;
  const f = finding.data!;
  const d = f.details;
  const names = (sid: string) => run.data?.experiment.sessions.find((s) => s.id === sid)?.name ?? shortId(sid);
  const shot = (o: ObservationRecord | null) => o?.artifacts.find((a) => a.type === 'screenshot');
  const dom = (o: ObservationRecord | null) => o?.artifacts.find((a) => a.type === 'dom_html');
  const related = (d.relatedFindingIds ?? []).map((rid) => all.data?.find((x) => x.id === rid)).filter(Boolean);
  const evidence: Array<{ side: string; a: ArtifactRef; obsId: string }> = [
    ...(f.baselineObservation?.artifacts ?? []).map((a) => ({ side: names(f.baselineSessionId), a, obsId: f.baselineObservation!.id })),
    ...(f.comparisonObservation?.artifacts ?? []).map((a) => ({ side: names(f.comparisonSessionId), a, obsId: f.comparisonObservation!.id }))
  ];
  const baselineValue = f.baselineObservation?.payload.commercialValues.find((v) => v.key === f.subjectKey);
  const comparisonValue = f.comparisonObservation?.payload.commercialValues.find((v) => v.key === f.subjectKey);
  const journeySteps = run.data?.experiment.journeys[0]?.steps.map((s) => s.configuration) ?? [];
  const comparisonSession = run.data?.experiment.sessions.find((s) => s.id === f.comparisonSessionId);

  return (
    <Page>
      <header className="border-b border-line px-6 pb-5 pt-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={f.severity} />
          <span className="text-[13px] font-medium text-fg-2">{humanize(f.type)}</span>
          <span className="font-mono text-[11.5px] text-fg-3">@{f.checkpoint}</span>
          <ClassificationTag value={f.classification} />
        </div>
        <h1 className="mt-3 max-w-4xl text-[20px] font-semibold leading-snug tracking-[-0.01em]">{f.description}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-fg-3">
          <EvidenceHash value={f.id} label="finding" chars={13} />
          {run.data && (
            <Link to={`/app/runs/${run.data.id}`} className="hover:text-fg">
              run {shortId(run.data.id)} →
            </Link>
          )}
          <span>discovered {formatDate(f.createdAt)}</span>
        </div>
      </header>

      <div className="grid gap-4 px-6 pt-5 lg:px-8 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Section n={1} title="Finding summary">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                <div>
                  <div className="eyebrow text-accent">Baseline · {names(f.baselineSessionId)}</div>
                  <div className={cx('mt-2 whitespace-pre-line font-mono text-[22px] leading-tight', !d.baseline && 'italic text-fg-3')}>{d.baseline?.value ?? 'absent'}</div>
                </div>
                <div className="axis-v" aria-hidden />
                <div>
                  <div className="eyebrow text-info">Comparison · {names(f.comparisonSessionId)}</div>
                  <div className={cx('mt-2 whitespace-pre-line font-mono text-[22px] leading-tight', !d.comparison && 'italic text-fg-3')}>{d.comparison?.value ?? 'absent'}</div>
                </div>
              </div>
              <div className="min-w-[210px] space-y-2 border-line lg:border-l lg:pl-5">
                {d.delta !== undefined && (
                  <div>
                    <div className="text-[11px] text-fg-3">Delta</div>
                    <div className={cx('font-mono text-[20px]', d.delta > 0 ? 'text-danger' : 'text-success')}>
                      {d.delta > 0 ? '+' : ''}
                      {d.delta.toFixed(2)} {d.currency ?? ''}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-1 text-[11px] text-fg-3">Confidence</div>
                  <ConfidenceIndicator value={f.confidence} />
                </div>
              </div>
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={2} title="Baseline observation">
              <ObservationCard label="Baseline" role="baseline" obs={f.baselineObservation} run={run.data} sessionId={f.baselineSessionId} />
            </Section>
            <Section n={3} title="Comparison observation">
              <ObservationCard label="Comparison" role="comparison" obs={f.comparisonObservation} run={run.data} sessionId={f.comparisonSessionId} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={4} title="Original values" aside={<span className="text-[11px] text-fg-3">raw text as rendered</span>}>
              <dl className="kv">
                <dt>Baseline</dt>
                <dd className="mono break-words">{d.baseline?.rawText ? `“${d.baseline.rawText}”` : d.baseline?.value ?? '—'}</dd>
                <dt>Comparison</dt>
                <dd className="mono break-words">{d.comparison?.rawText ? `“${d.comparison.rawText}”` : d.comparison?.value ?? '—'}</dd>
              </dl>
            </Section>
            <Section n={5} title="Normalized values" aside={<span className="font-mono text-[11px] text-fg-3">normalizer v{f.baselineObservation?.payload.normalizationVersion ?? f.comparisonObservation?.payload.normalizationVersion ?? 1}</span>}>
              <dl className="kv">
                <dt>Alignment key</dt>
                <dd className="mono break-all">{f.subjectKey}</dd>
                {(baselineValue ?? comparisonValue) && (
                  <>
                    <dt>Kind</dt>
                    <dd>{humanize((baselineValue ?? comparisonValue)!.kind)}</dd>
                    <dt>Baseline</dt>
                    <dd className="mono">{baselineValue ? `${baselineValue.amount ?? 'null'} ${baselineValue.currency ?? ''}${baselineValue.recurring ? ' recurring' : ''}` : 'missing'}</dd>
                    <dt>Comparison</dt>
                    <dd className="mono">{comparisonValue ? `${comparisonValue.amount ?? 'null'} ${comparisonValue.currency ?? ''}${comparisonValue.recurring ? ' recurring' : ''}` : 'missing'}</dd>
                    <dt>Extraction</dt>
                    <dd className="text-fg-2">
                      {humanize((baselineValue ?? comparisonValue)!.source)}
                      {(baselineValue ?? comparisonValue)!.uncertainty && <span className="text-warning"> · {(baselineValue ?? comparisonValue)!.uncertainty}</span>}
                    </dd>
                  </>
                )}
              </dl>
            </Section>
          </div>

          <Section n={6} title="Difference explanation">
            <p className="text-[13.5px] leading-relaxed">{f.description}</p>
            <ul className="mt-3 space-y-1 text-[12.5px] text-fg-2">
              {f.confidenceRationale.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="text-fg-3">—</span> {r}
                </li>
              ))}
            </ul>
            {related.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-[11.5px] text-fg-3">Related findings (arithmetically linked)</div>
                {related.map((r) => (
                  <Link key={r!.id} to={`/app/findings/${r!.id}`} className="flex items-center gap-2 py-1 text-[13px] text-accent hover:underline">
                    {humanize(r!.type)} · {r!.details.subject} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section n={8} title="Screenshots" aside={<span className="text-[11px] text-fg-3">highlight from recorded element bounds</span>}>
            <div className="grid gap-3 lg:grid-cols-2">
              {(['baseline', 'comparison'] as const).map((side) => {
                const obs = side === 'baseline' ? f.baselineObservation : f.comparisonObservation;
                const sid = side === 'baseline' ? f.baselineSessionId : f.comparisonSessionId;
                return <BrowserViewport key={side} title={names(sid)} role={side} observation={obs ?? undefined} screenshotId={shot(obs)?.id} highlights={highlightsFor(f, side, obs?.payload, true)} maxHeight={460} />;
              })}
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={9} title="DOM evidence">
              <dl className="kv">
                <dt>Baseline locator</dt>
                <dd className="mono break-all">{d.baseline?.sourceLocator ?? '—'}</dd>
                <dt>Comparison locator</dt>
                <dd className="mono break-all">{d.comparison?.sourceLocator ?? '—'}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {[f.baselineObservation, f.comparisonObservation].map((o, i) =>
                  dom(o) ? (
                    <a key={i} href={evidenceUrl(dom(o)!.id)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                      <FileCode2 className="h-3.5 w-3.5" /> {i === 0 ? 'Baseline' : 'Comparison'} DOM snapshot
                    </a>
                  ) : null
                )}
              </div>
            </Section>
            <Section n={11} title="Reproduction instructions">
              <ol className="space-y-1.5 text-[12.5px]">
                {reproductionSteps(journeySteps, comparisonSession, run.data?.experiment.investigation.targetUrl ?? '').map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-fg-3">{i + 1}</span>
                    <span className="text-fg-2">{s}</span>
                  </li>
                ))}
              </ol>
              <button className="btn-secondary btn-sm mt-3" disabled={!run.data || rerun.isPending} onClick={() => rerun.mutate()}>
                <RotateCcw className="h-3.5 w-3.5" /> Reproduce: rerun experiment
              </button>
              {rerun.error && <p className="field-error">{(rerun.error as Error).message}</p>}
            </Section>
          </div>

          <Section n={10} title="Relevant network observations" aside={<Network className="h-4 w-4 text-fg-3" />}>
            {run.data ? (
              <NetworkSection runId={run.data.id} sessionIds={[f.baselineSessionId, f.comparisonSessionId]} names={names} checkpointUrls={[f.baselineObservation?.payload.url, f.comparisonObservation?.payload.url].filter(Boolean) as string[]} />
            ) : (
              <p className="text-[12.5px] text-fg-3">Loading…</p>
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <Section n={7} title="Supporting evidence" aside={<span className="font-mono text-[11px] text-fg-3">{evidence.length}</span>}>
            <ul className="-mx-1 space-y-1">
              {evidence.map(({ side, a }) => (
                <li key={a.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-raised">
                  <a href={evidenceUrl(a.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <span className="block font-mono text-[11.5px] text-fg">{a.type}</span>
                    <span className="block truncate text-[11px] text-fg-3">
                      {side} · {formatBytes(a.size)}
                    </span>
                  </a>
                  <EvidenceHash value={a.sha256} chars={8} />
                </li>
              ))}
            </ul>
            <Link to={`/app/evidence?runId=${f.executionRunId}`} className="mt-3 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
              All evidence for this run <ArrowRight className="h-3 w-3" />
            </Link>
          </Section>

          <Section n={12} title="Alternative explanations" tone="guidance" aside={<span className="text-[10.5px] uppercase tracking-wider text-warning">guidance</span>}>
            <p className="mb-2 text-[11.5px] text-fg-3">Standard confounders for this category. Not evaluated against the evidence.</p>
            <ul className="space-y-1.5 text-[12.5px] text-fg-2">
              {alternativeExplanations(f).map((x) => (
                <li key={x} className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-3" /> {x}
                </li>
              ))}
            </ul>
          </Section>

          <Section n={13} title="AI interpretation" aside={<Bot className="h-4 w-4 text-fg-3" />}>
            {settings.data?.aiProvider ? (
              <Notice tone="info">An AI provider ({settings.data.aiProvider}) is configured, but interpretation generation is not implemented yet. Findings remain deterministic.</Notice>
            ) : (
              <p className="text-[12.5px] text-fg-2">No AI provider is configured. MIRROR does not need AI: this finding was produced entirely by the deterministic engine. When enabled, AI output will be labelled and must cite these observation IDs.</p>
            )}
          </Section>

          <Section n={14} title="Recommended confirmation experiments" tone="guidance" aside={<FlaskConical className="h-4 w-4 text-fg-3" />}>
            <ol className="space-y-1.5 text-[12.5px] text-fg-2">
              {confirmationExperiments(f).map((x, i) => (
                <li key={x} className="flex gap-2">
                  <span className="font-mono text-[11px] text-accent">{i + 1}</span> {x}
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </Page>
  );
}
