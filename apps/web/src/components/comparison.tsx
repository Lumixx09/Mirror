import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Columns2, Layers, Minus, Plus, RotateCcw, ScanLine, Link2, Link2Off, FileCode2, Image as ImageIcon } from 'lucide-react';
import type { ElementBox, PageObservation } from '@mirror/contracts';
import { evidenceUrl, type FindingRecord, type ObservationRecord, type SessionRecord } from '../api';
import { EvidenceHash, Segmented, StatusBadge, cx, formatDate, humanize } from './ui';

export type HighlightKind = 'added' | 'removed' | 'modified';

export interface Highlight {
  box: ElementBox;
  kind: HighlightKind;
  label: string;
  active?: boolean;
  findingId?: string;
}

const KIND_STYLE: Record<HighlightKind, string> = {
  added: 'border-success bg-success/10',
  removed: 'border-danger bg-danger/10',
  modified: 'border-warning bg-warning/10'
};

/** Locate the element boxes behind a finding in one session's observation. */
export function highlightsFor(finding: FindingRecord, side: 'baseline' | 'comparison', obs: PageObservation | undefined, active: boolean): Highlight[] {
  if (!obs) return [];
  const present = side === 'baseline' ? finding.details.baseline : finding.details.comparison;
  if (!present) return [];
  const other = side === 'baseline' ? finding.details.comparison : finding.details.baseline;
  const kind: HighlightKind = other ? 'modified' : side === 'comparison' ? 'added' : 'removed';
  const value = obs.commercialValues.find((v) => v.key === finding.subjectKey);
  const control = obs.formControls.find((c) => c.key === finding.subjectKey);
  const box = value?.box ?? control?.box;
  return box ? [{ box, kind, label: finding.details.subject, active, findingId: finding.id }] : [];
}

/** A captured page in a browser frame, with difference highlights positioned in document coordinates. */
export function BrowserViewport({
  title,
  role,
  observation,
  screenshotId,
  highlights = [],
  zoom = 1,
  scrollRef,
  onScroll,
  footer,
  onHighlightClick,
  maxHeight = 640
}: {
  title: string;
  role?: string;
  observation?: ObservationRecord;
  screenshotId?: string;
  highlights?: Highlight[];
  zoom?: number;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  footer?: ReactNode;
  onHighlightClick?: (findingId: string) => void;
  maxHeight?: number;
}) {
  const vw = observation?.payload.viewport.width ?? 1280;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const docHeight = natural ? (natural.h / natural.w) * vw : 0;

  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <figcaption className="flex items-center gap-3 border-b border-line bg-raised/50 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-fg-2" title={observation?.payload.url}>
          {observation?.payload.url ?? 'not captured'}
        </span>
        <span className="flex items-center gap-2 text-[12px] font-medium">
          {role && <span className={cx('rounded px-1.5 py-px font-mono text-[10px] uppercase tracking-wider', role === 'baseline' ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info')}>{role}</span>}
          {title}
        </span>
      </figcaption>
      <div ref={scrollRef} onScroll={onScroll} className="relative overflow-auto bg-[#0c0f15]" style={{ maxHeight }}>
        {screenshotId ? (
          <div className="relative origin-top-left" style={{ width: `${zoom * 100}%` }}>
            <img
              src={evidenceUrl(screenshotId)}
              alt={`${title} screenshot at checkpoint ${observation?.checkpoint ?? ''}`}
              className="block w-full select-none"
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
            {natural &&
              highlights.map((h, i) => (
                <motion.button
                  key={`${h.findingId}-${i}`}
                  type="button"
                  onClick={() => h.findingId && onHighlightClick?.(h.findingId)}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: h.active ? 1 : 0.55, scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className={cx('absolute rounded-[3px] border-[1.5px]', KIND_STYLE[h.kind], h.active && 'ring-2 ring-white/20')}
                  style={{
                    left: `${(h.box.x / vw) * 100}%`,
                    top: `${(h.box.y / docHeight) * 100}%`,
                    width: `${(h.box.width / vw) * 100}%`,
                    height: `${(h.box.height / docHeight) * 100}%`
                  }}
                  aria-label={`${h.kind}: ${h.label}`}
                  title={`${h.kind}: ${h.label}`}
                />
              ))}
          </div>
        ) : (
          <div className="grid h-64 place-items-center text-[13px] text-fg-3">No screenshot captured for this checkpoint</div>
        )}
      </div>
      {footer && <div className="border-t border-line px-3 py-2">{footer}</div>}
    </figure>
  );
}

/** Pixel difference between two screenshots, computed in the browser from the stored evidence. */
function DiffCanvas({ baselineId, comparisonId }: { baselineId: string; comparisonId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<{ changed: number; total: number; sizeMismatch: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'use-credentials';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Screenshot could not be loaded'));
        img.src = src;
      });
    Promise.all([load(evidenceUrl(baselineId)), load(evidenceUrl(comparisonId))])
      .then(([a, b]) => {
        if (cancelled || !ref.current) return;
        const w = Math.min(a.naturalWidth, b.naturalWidth);
        const h = Math.min(a.naturalHeight, b.naturalHeight);
        const ca = document.createElement('canvas');
        ca.width = w;
        ca.height = h;
        const xa = ca.getContext('2d', { willReadFrequently: true })!;
        xa.drawImage(a, 0, 0);
        const da = xa.getImageData(0, 0, w, h);
        xa.clearRect(0, 0, w, h);
        xa.drawImage(b, 0, 0);
        const db = xa.getImageData(0, 0, w, h);
        const out = ref.current.getContext('2d')!;
        ref.current.width = w;
        ref.current.height = h;
        const img = out.createImageData(w, h);
        let changed = 0;
        for (let i = 0; i < da.data.length; i += 4) {
          const delta = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
          if (delta > 48) {
            changed++;
            img.data[i] = 240;
            img.data[i + 1] = 107;
            img.data[i + 2] = 120;
            img.data[i + 3] = 255;
          } else {
            // Dimmed baseline for orientation
            const g = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = g * 0.28;
            img.data[i + 3] = 255;
          }
        }
        out.putImageData(img, 0, 0);
        setStats({ changed, total: w * h, sizeMismatch: a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [baselineId, comparisonId]);

  return (
    <div>
      {error && <p className="p-4 text-[13px] text-danger">{error}</p>}
      <canvas ref={ref} className="block w-full" aria-label="Pixel difference map" />
      {stats && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 font-mono text-[11px] text-fg-3">
          <span>
            changed pixels <span className="text-fg">{stats.changed.toLocaleString()}</span> ({((stats.changed / stats.total) * 100).toFixed(2)}%)
          </span>
          {stats.sizeMismatch && <span className="text-warning">capture sizes differ; compared the overlapping area</span>}
          <span>visual difference alone is not evidence of a commercial or behavioural change</span>
        </div>
      )}
    </div>
  );
}

type Mode = 'side' | 'overlay' | 'diff' | 'dom';

/**
 * The comparison workstation: baseline and one comparison session, aligned on the same checkpoint.
 * Modes: side-by-side, overlay (opacity blend), pixel difference, and structured DOM observations.
 */
export function BrowserComparison({
  baseline,
  comparison,
  baselineObs,
  comparisonObs,
  findings,
  activeFindingId,
  onSelectFinding,
  sessionStatus
}: {
  baseline: SessionRecord;
  comparison: SessionRecord;
  baselineObs?: ObservationRecord;
  comparisonObs?: ObservationRecord;
  findings: FindingRecord[];
  activeFindingId?: string | null;
  onSelectFinding?: (id: string) => void;
  sessionStatus?: (id: string) => string | undefined;
}) {
  const [mode, setMode] = useState<Mode>('side');
  const [zoom, setZoom] = useState(1);
  const [sync, setSync] = useState(true);
  const [blend, setBlend] = useState(0.5);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const shot = (o?: ObservationRecord) => o?.artifacts.find((a) => a.type === 'screenshot');
  const bShot = shot(baselineObs);
  const cShot = shot(comparisonObs);

  const scrollSync = (from: 'left' | 'right') => () => {
    if (!sync || syncing.current) return;
    const a = from === 'left' ? left.current : right.current;
    const b = from === 'left' ? right.current : left.current;
    if (!a || !b) return;
    syncing.current = true;
    b.scrollTop = a.scrollTop;
    b.scrollLeft = a.scrollLeft;
    requestAnimationFrame(() => (syncing.current = false));
  };

  const baseHighlights = useMemo(() => findings.flatMap((f) => highlightsFor(f, 'baseline', baselineObs?.payload, f.id === activeFindingId)), [findings, baselineObs, activeFindingId]);
  const compHighlights = useMemo(() => findings.flatMap((f) => highlightsFor(f, 'comparison', comparisonObs?.payload, f.id === activeFindingId)), [findings, comparisonObs, activeFindingId]);

  // Bring the active highlight into view in both panes.
  useEffect(() => {
    if (!activeFindingId) return;
    const t = setTimeout(() => {
      for (const pane of [left.current, right.current]) {
        const el = pane?.querySelector<HTMLElement>('button.ring-2');
        if (el && pane) pane.scrollTo({ top: Math.max(0, el.offsetTop - 80), behavior: 'smooth' });
      }
    }, 60);
    return () => clearTimeout(t);
  }, [activeFindingId, mode]);

  const footer = (o?: ObservationRecord, a?: { sha256: string }, sid?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-3">
      <span className="font-mono">
        {o ? `${o.payload.viewport.width}×${o.payload.viewport.height} · ${formatDate(o.capturedAt)}` : 'not captured'}
      </span>
      <span className="flex items-center gap-3">
        {sid && sessionStatus?.(sid) && <StatusBadge status={sessionStatus(sid)!} subtle />}
        {a && <EvidenceHash value={a.sha256} label="sha256" chars={10} />}
      </span>
    </div>
  );

  return (
    <section aria-label="Browser comparison" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Mode>
          label="Comparison mode"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'side', label: <><Columns2 className="h-3.5 w-3.5" /> Side by side</> },
            { id: 'overlay', label: <><Layers className="h-3.5 w-3.5" /> Overlay</> },
            { id: 'diff', label: <><ScanLine className="h-3.5 w-3.5" /> Difference only</> },
            { id: 'dom', label: <><FileCode2 className="h-3.5 w-3.5" /> DOM</> }
          ]}
        />
        {mode !== 'dom' && mode !== 'diff' && (
          <div className="flex items-center gap-1 rounded-md border border-line-strong p-0.5">
            <button className="icon-btn h-7 w-7" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" disabled={zoom <= 0.5}>
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-12 text-center font-mono text-[11px] text-fg-2" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button className="icon-btn h-7 w-7" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" disabled={zoom >= 2.5}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {mode === 'side' && (
          <button className={cx('btn-secondary btn-sm', sync && 'border-accent/50 text-accent')} onClick={() => setSync((s) => !s)} aria-pressed={sync}>
            {sync ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />} Sync scroll
          </button>
        )}
        {mode === 'overlay' && (
          <label className="flex items-center gap-2 text-xs text-fg-2">
            <span className="text-accent">{baseline.name}</span>
            <input type="range" min={0} max={1} step={0.01} value={blend} onChange={(e) => setBlend(Number(e.target.value))} className="w-36 accent-[rgb(var(--accent))]" aria-label="Overlay balance" />
            <span className="text-info">{comparison.name}</span>
          </label>
        )}
        <button
          className="btn-ghost btn-sm"
          onClick={() => {
            setZoom(1);
            setBlend(0.5);
            left.current?.scrollTo({ top: 0, left: 0 });
            right.current?.scrollTo({ top: 0, left: 0 });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset view
        </button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-3" aria-label="Legend">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-success bg-success/20" /> Only in comparison</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-danger bg-danger/20" /> Only in baseline</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-warning bg-warning/20" /> Changed value</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {mode === 'side' && (
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
              <BrowserViewport title={baseline.name} role="baseline" observation={baselineObs} screenshotId={bShot?.id} highlights={baseHighlights} zoom={zoom} scrollRef={left} onScroll={scrollSync('left')} onHighlightClick={onSelectFinding} footer={footer(baselineObs, bShot, baseline.id)} />
              <div className="axis-v hidden lg:block" aria-hidden />
              <BrowserViewport title={comparison.name} role="comparison" observation={comparisonObs} screenshotId={cShot?.id} highlights={compHighlights} zoom={zoom} scrollRef={right} onScroll={scrollSync('right')} onHighlightClick={onSelectFinding} footer={footer(comparisonObs, cShot, comparison.id)} />
            </div>
          )}
          {mode === 'overlay' && (
            <div className="overflow-hidden rounded-lg border border-line bg-[#0c0f15]">
              {bShot && cShot ? (
                <div className="max-h-[680px] overflow-auto">
                  <div className="relative" style={{ width: `${zoom * 100}%` }}>
                    <img src={evidenceUrl(bShot.id)} alt={`${baseline.name} screenshot`} className="block w-full" />
                    <img src={evidenceUrl(cShot.id)} alt={`${comparison.name} screenshot`} className="absolute inset-0 block w-full" style={{ opacity: blend }} />
                  </div>
                </div>
              ) : (
                <p className="p-6 text-center text-[13px] text-fg-3">Both sessions need a screenshot at this checkpoint.</p>
              )}
            </div>
          )}
          {mode === 'diff' && (
            <div className="overflow-hidden rounded-lg border border-line bg-[#0c0f15]">
              {bShot && cShot ? <DiffCanvas baselineId={bShot.id} comparisonId={cShot.id} /> : <p className="p-6 text-center text-[13px] text-fg-3">Both sessions need a screenshot at this checkpoint.</p>}
            </div>
          )}
          {mode === 'dom' && <DomComparison baseline={baselineObs?.payload} comparison={comparisonObs?.payload} findings={findings} baselineName={baseline.name} comparisonName={comparison.name} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/** Structured comparison of what the observation engine extracted from each DOM. */
function DomComparison({ baseline, comparison, findings, baselineName, comparisonName }: { baseline?: PageObservation; comparison?: PageObservation; findings: FindingRecord[]; baselineName: string; comparisonName: string }) {
  const flagged = new Set(findings.map((f) => f.subjectKey));
  const keys = Array.from(new Set([...(baseline?.commercialValues ?? []), ...(comparison?.commercialValues ?? [])].map((v) => v.key)));
  const controls = Array.from(new Set([...(baseline?.formControls ?? []), ...(comparison?.formControls ?? [])].map((c) => c.key)));
  const money = (v?: { amount: number | null; currency: string | null; recurring: boolean }) => (v ? (v.amount === null ? 'unparsed' : `${v.currency ?? ''} ${v.amount.toFixed(2)}${v.recurring ? ' /period' : ''}`) : '—');
  const baseLines = new Set(baseline?.textLines ?? []);
  const compLines = new Set(comparison?.textLines ?? []);

  return (
    <div className="grid gap-3 xl:grid-cols-[3fr_2fr]">
      <div className="panel overflow-x-auto">
        <table className="table">
          <caption className="panel-head text-left">
            <span className="panel-title">Extracted values</span>
            <span className="flex items-center gap-1 text-[11px] text-fg-3">
              <ImageIcon className="h-3 w-3" /> source: live DOM at capture
            </span>
          </caption>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Kind</th>
              <th>{baselineName}</th>
              <th>{comparisonName}</th>
              <th>Extraction</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const b = baseline?.commercialValues.find((v) => v.key === key);
              const c = comparison?.commercialValues.find((v) => v.key === key);
              const x = (b ?? c)!;
              const diff = flagged.has(key);
              return (
                <tr key={key} className={cx(diff && 'bg-danger/[0.05]')}>
                  <td>
                    <div className="text-[13px]">{x.label}</div>
                    <div className="font-mono text-[10.5px] text-fg-3">{x.sourceLocator}</div>
                  </td>
                  <td className="text-xs text-fg-2">{humanize(x.kind)}</td>
                  <td className={cx('mono', !b && 'text-danger')}>{money(b)}</td>
                  <td className={cx('mono', diff && 'text-warning', !c && 'text-danger')}>{money(c)}</td>
                  <td className="text-[11px] text-fg-3">
                    {humanize(x.source)} · {x.confidence.toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {controls.map((key) => {
              const b = baseline?.formControls.find((v) => v.key === key);
              const c = comparison?.formControls.find((v) => v.key === key);
              const x = (b ?? c)!;
              const state = (v?: typeof b) => (!v ? '—' : v.controlType === 'select' ? v.value : v.checked ? 'selected' : 'not selected');
              return (
                <tr key={key} className={cx(flagged.has(key) && 'bg-danger/[0.05]')}>
                  <td>
                    <div className="text-[13px]">{x.label}</div>
                    <div className="font-mono text-[10.5px] text-fg-3">{x.sourceLocator}</div>
                  </td>
                  <td className="text-xs text-fg-2">default {x.controlType}</td>
                  <td className="mono">{state(b)}</td>
                  <td className={cx('mono', flagged.has(key) && 'text-warning')}>{state(c)}</td>
                  <td className="text-[11px] text-fg-3">DOM state before interaction</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Visible text</span>
          <span className="font-mono text-[11px] text-fg-3">normalized lines</span>
        </div>
        <ul className="max-h-[460px] overflow-y-auto py-1 font-mono text-[11.5px]">
          {Array.from(new Set([...(baseline?.textLines ?? []), ...(comparison?.textLines ?? [])])).map((line) => {
            const inB = baseLines.has(line);
            const inC = compLines.has(line);
            return (
              <li key={line} className={cx('flex gap-2 px-3 py-0.5', inB && !inC && 'bg-danger/[0.07] text-danger', !inB && inC && 'bg-success/[0.07] text-success', inB && inC && 'text-fg-2')}>
                <span className="w-3 shrink-0 select-none" aria-label={inB && inC ? 'in both' : inB ? 'only in baseline' : 'only in comparison'}>
                  {inB && inC ? ' ' : inB ? '−' : '+'}
                </span>
                <span className="break-all">{line}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
