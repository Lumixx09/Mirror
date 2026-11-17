import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Fingerprint, FlaskConical, FolderSearch, Layers3, Plus, ScanSearch, Timer } from 'lucide-react';
import { api, evidenceUrl, type Overview } from '../api';
import { useAuth } from '../auth';
import { MirrorAxis } from '../components/brand';
import { Donut, HistoryBars, categoryColor } from '../components/charts';
import { CountUp, Reveal, Stagger, StaggerItem, Tilt } from '../components/motion';
import { useBreadcrumbs } from '../components/shell';
import { EmptyState, ErrorState, MetricDisplay, Page, SeverityBadge, Skeleton, StatusBadge, StatusGlyph, cx, formatDuration, formatRelative, hostOf, humanize, shortId } from '../components/ui';

const ease = [0.2, 0.8, 0.2, 1] as const;

function SpotlightFrame({ side, name, value, screenshotId }: { side: 'left' | 'right'; name: string; value: string | null; screenshotId: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'left' ? 24 : -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease, delay: 0.1 }}
      className="relative w-[46%] max-w-[300px]"
    >
      <Tilt base={side === 'left' ? 10 : -10} max={6}>
      <div className={cx('overflow-hidden rounded-lg border bg-surface shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]', side === 'left' ? 'border-accent/30' : 'border-info/30')}>
        <div className="flex items-center gap-1 border-b border-line bg-raised px-2 py-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          ))}
        </div>
        {screenshotId ? (
          <img src={evidenceUrl(screenshotId)} alt={`${name} captured page`} className="block h-[150px] w-full object-cover object-top" loading="lazy" />
        ) : (
          <div className="h-[150px] bg-raised" />
        )}
      </div>
      <div className={cx('absolute -bottom-4 rounded-md border bg-bg px-2.5 py-1', side === 'left' ? 'left-3 border-accent/40' : 'right-3 border-info/40')}>
        <div className={cx('max-w-[140px] truncate font-mono text-[9.5px] uppercase tracking-wider', side === 'left' ? 'text-accent' : 'text-info')}>{name}</div>
        <div className="font-mono text-[16px] font-medium leading-tight">{value ?? 'absent'}</div>
      </div>
      </Tilt>
    </motion.div>
  );
}

function Hero({ data }: { data: Overview }) {
  const { user } = useAuth();
  const s = data.spotlight;
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid-paper pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(90deg,transparent,black_60%)]" aria-hidden />
      <div className="ambient pointer-events-none absolute right-[8%] top-[-20%] h-[360px] w-[560px] rounded-full opacity-70 blur-3xl" style={{ background: 'radial-gradient(closest-side, rgb(var(--accent) / 0.14), rgb(var(--info) / 0.05), transparent)' }} aria-hidden />
      <div className="relative grid items-center gap-8 px-6 py-8 lg:grid-cols-[1.05fr_1fr] lg:px-8">
        <div>
          <div className="eyebrow text-accent">/// Investigation workstation</div>
          <h1 className="mt-3 font-display text-[40px] leading-[1.02] tracking-[-0.01em] xl:text-[48px]">
            One website. Multiple realities.
            <br />
            <span className="italic text-fg-2">Expose the differences.</span>
          </h1>
          <p className="mt-3 max-w-lg text-[13.5px] text-fg-2">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Run controlled browser experiments, compare what each session experienced and build evidence-backed findings.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/app/investigations/new" className="btn-primary btn-lg">
              <Plus className="h-4 w-4" /> Create investigation
            </Link>
            {s ? (
              <Link to={`/app/runs/${s.runId}`} className="btn-secondary btn-lg">
                Open latest comparison <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link to="/app/investigations/new?demo=1" className="btn-secondary btn-lg">
                Run the demo scenario
              </Link>
            )}
          </div>
        </div>

        <div className="relative flex min-h-[230px] items-center justify-center gap-[8%] pb-6">
          <MirrorAxis className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" background="linear-gradient(180deg, transparent, rgb(var(--accent)), rgb(var(--info)) 75%, transparent)" />
          {s ? (
            <>
              <SpotlightFrame side="left" name={s.baseline.name} value={s.baseline.value} screenshotId={s.baseline.screenshotId} />
              <SpotlightFrame side="right" name={s.comparison.name} value={s.comparison.value} screenshotId={s.comparison.screenshotId} />
              <Link to={`/app/findings/${s.finding.id}`} className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-line-strong bg-surface px-2 py-0.5 font-mono text-[10.5px] text-fg-2 hover:text-fg">
                {s.finding.subject} @ {s.checkpoint}
              </Link>
            </>
          ) : (
            <p className="relative max-w-[260px] rounded-md border border-line-strong bg-surface px-4 py-3 text-center text-[12.5px] text-fg-2">
              Your latest captured comparison appears here once a run finds a commercial difference.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 p-8" role="status" aria-label="Loading overview">
      <Skeleton className="h-52 w-full" />
      <div className="grid grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  useBreadcrumbs([{ label: 'Overview' }]);
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 20_000 });

  if (overview.isLoading) return <OverviewSkeleton />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const d = overview.data!;
  const t = d.totals;
  const typeTotal = d.findingsByType.reduce((a, x) => a + x.count, 0);
  const spot = d.spotlight;
  const healthRate = d.health.window ? Math.round(((d.health.completed + d.health.partial) / d.health.window) * 100) : null;

  return (
    <Page>
      <Hero data={d} />

      <Stagger as="section" inView={false} gap={0.07} className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <StaggerItem className="transition-colors hover:bg-surface/60"><MetricDisplay label="Investigations" value={<CountUp value={t.investigations} />} icon={<FolderSearch className="h-4 w-4" />} /></StaggerItem>
        <StaggerItem className="transition-colors hover:bg-surface/60"><MetricDisplay label="Experiment runs" value={<CountUp value={t.runs} />} icon={<FlaskConical className="h-4 w-4" />} detail={`${t.experiments} experiment${t.experiments === 1 ? '' : 's'}`} /></StaggerItem>
        <StaggerItem className="transition-colors hover:bg-surface/60"><MetricDisplay label="Findings" value={<CountUp value={t.findings} />} icon={<ScanSearch className="h-4 w-4" />} detail={<span className={t.highFindings ? 'text-danger' : ''}>{t.highFindings} high severity</span>} /></StaggerItem>
        <StaggerItem className="transition-colors hover:bg-surface/60"><MetricDisplay label="Evidence artifacts" value={<CountUp value={t.artifacts} />} icon={<Fingerprint className="h-4 w-4" />} detail="SHA-256 recorded" /></StaggerItem>
        <StaggerItem className="transition-colors hover:bg-surface/60"><MetricDisplay label="Active runs" value={<CountUp value={t.activeRuns} />} icon={<Activity className="h-4 w-4" />} tone={t.activeRuns ? 'accent' : undefined} detail={t.activeRuns ? 'Executing now' : 'Idle'} /></StaggerItem>
      </Stagger>

      <div className="grid gap-4 px-6 pt-5 lg:px-8 xl:grid-cols-[1.6fr_1fr]">
        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Latest investigation with differences</span>
            {spot && <StatusBadge status={spot.status} />}
          </div>
          {spot ? (
            <div className="flex flex-col gap-5 p-4 sm:flex-row">
              <Link to={`/app/runs/${spot.runId}`} className="relative block h-[132px] w-full shrink-0 overflow-hidden rounded-md border border-line-strong sm:w-[220px]">
                {spot.comparison.screenshotId && <img src={evidenceUrl(spot.comparison.screenshotId)} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="chip">{hostOf(spot.investigation.targetUrl)}</div>
                <h2 className="mt-2 truncate text-[16px] font-semibold">{spot.investigation.title}</h2>
                <p className="mt-1 text-[13px] text-fg-2">
                  Latest run compared {spot.sessions} browser sessions and recorded {spot.findings} findings backed by {spot.artifacts} evidence artifacts.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link to={`/app/runs/${spot.runId}`} className="btn-primary btn-sm">
                    Open comparison <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link to={`/app/investigations/${spot.investigation.id}`} className="btn-secondary btn-sm">
                    Investigation
                  </Link>
                  <span className="ml-auto font-mono text-[11px] text-fg-3">run {shortId(spot.runId)}</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Layers3 className="h-5 w-5" />}
              title="No differences recorded yet"
              body="Run the controlled demo scenario to see MIRROR discover a hidden fee and a preselected subscription."
              action={
                <Link to="/app/investigations/new?demo=1" className="btn-primary">
                  Load demo scenario
                </Link>
              }
            />
          )}
        </Reveal>

        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Findings by category</span>
            <Link to="/app/findings" className="text-xs text-fg-3 hover:text-fg">
              All findings →
            </Link>
          </div>
          {typeTotal ? (
            <div className="flex items-center gap-5 p-4">
              <Donut data={d.findingsByType.map((x) => ({ key: x.type, value: x.count }))} total={typeTotal} label="findings" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {d.findingsByType.map((x) => (
                  <li key={x.type}>
                    <Link to={`/app/findings?type=${x.type}`} className="flex items-center gap-2 rounded px-1 py-0.5 text-[12.5px] hover:bg-raised">
                      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: categoryColor(x.type) }} aria-hidden />
                      <span className="flex-1 truncate capitalize text-fg-2">{humanize(x.type.replace('_difference', ''))}</span>
                      <span className="font-mono text-[11.5px] text-fg-3">{x.count}</span>
                      <span className="w-9 text-right font-mono text-[11.5px]">{Math.round((x.count / typeTotal) * 100)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState title="No findings yet" body="Findings appear after the first completed run." />
          )}
        </Reveal>
      </div>

      <div className="grid gap-4 px-6 pt-4 lg:px-8 xl:grid-cols-[1.6fr_1fr]">
        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Execution activity</span>
            <span className="text-[11px] text-fg-3">Last 14 days</span>
          </div>
          <div className="p-4">
            <HistoryBars data={d.history} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
            <div className="px-4 py-3">
              <div className="text-[11px] text-fg-3">Success rate</div>
              <div className="font-mono text-[15px]">{healthRate === null ? '—' : `${healthRate}%`}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] text-fg-3">Failed or blocked</div>
              <div className={cx('font-mono text-[15px]', d.health.failed > 0 && 'text-danger')}>{d.health.failed}</div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-1 text-[11px] text-fg-3">
                <Timer className="h-3 w-3" /> Avg. run duration
              </div>
              <div className="font-mono text-[15px]">{formatDuration(d.health.avgDurationMs)}</div>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Recent findings</span>
            <Link to="/app/findings" className="text-xs text-fg-3 hover:text-fg">
              View all →
            </Link>
          </div>
          {d.recentFindings.length ? (
            <ul className="divide-y divide-line">
              {d.recentFindings.map((f) => (
                <li key={f.id}>
                  <Link to={`/app/findings/${f.id}`} className="flex items-start gap-3 px-4 py-2.5 transition-[background-color,transform] duration-200 hover:translate-x-0.5 hover:bg-raised/70">
                    <span className="mt-1 h-7 w-[3px] shrink-0 rounded-full" style={{ background: categoryColor(f.type) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{f.subject || humanize(f.type)}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">
                        {humanize(f.type)} · {f.comparisonName ?? 'comparison'} vs {f.baselineName ?? 'baseline'}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <SeverityBadge severity={f.severity} />
                      <span className="text-[10.5px] text-fg-3">{formatRelative(f.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing yet" />
          )}
        </Reveal>
      </div>

      <div className="grid gap-4 px-6 pt-4 lg:px-8 xl:grid-cols-[1.6fr_1fr]">
        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Recent runs</span>
            <Link to="/app/experiments" className="text-xs text-fg-3 hover:text-fg">
              All experiments →
            </Link>
          </div>
          {d.recentRuns.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Investigation</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Sessions</th>
                  <th>Findings</th>
                  <th className="hidden md:table-cell">Started</th>
                </tr>
              </thead>
              <tbody>
                {d.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/app/runs/${r.id}`} className="font-medium hover:text-accent">
                        {r.experiment.investigation.title}
                      </Link>
                      <div className="font-mono text-[11px] text-fg-3">run {shortId(r.id)}</div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="mono hidden text-fg-2 md:table-cell">{r.experiment._count.sessions}</td>
                    <td className="mono text-fg-2">{r._count?.findings ?? 0}</td>
                    <td className="hidden text-fg-3 md:table-cell">{formatRelative(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No runs yet" />
          )}
        </Reveal>

        <Reveal as="section" className="panel panel-interactive">
          <div className="panel-head">
            <span className="panel-title">Activity</span>
            <Link to="/app/settings#audit" className="text-xs text-fg-3 hover:text-fg">
              Audit log →
            </Link>
          </div>
          <ol className="relative px-4 py-3">
            <span className="absolute bottom-4 left-[23px] top-4 w-px bg-line" aria-hidden />
            {d.activity.slice(0, 8).map((e) => (
              <li key={e.id} className="relative flex gap-3 py-1.5">
                <span className="z-10 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong bg-surface">
                  <StatusGlyph status={e.eventType.startsWith('run.') ? e.eventType.replace('run.', '') : 'ready'} className="h-2.5 w-2.5" />
                </span>
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <span className="font-mono text-[11.5px] text-fg-2">{e.eventType}</span>
                  <span className="block text-[11px] text-fg-3">{formatRelative(e.timestamp)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </Page>
  );
}
