import { useState } from 'react';
import { motion } from 'motion/react';
import { cx, humanize } from './ui';

/** Fixed mapping from finding category to a design-token colour (same everywhere in the product). */
export const CATEGORY_COLOR: Record<string, string> = {
  price_difference: 'rgb(var(--accent))',
  fee_difference: 'rgb(var(--danger))',
  subscription_difference: 'rgb(var(--warning))',
  default_selection_difference: 'rgb(var(--info))',
  journey_difference: 'rgb(var(--success))',
  navigation_difference: 'rgb(var(--accent-hover))',
  content_difference: 'rgb(var(--text-muted))',
  structure_difference: 'rgb(var(--border-strong))',
  unknown_difference: 'rgb(var(--border-strong))'
};
export const categoryColor = (type: string) => CATEGORY_COLOR[type] ?? 'rgb(var(--border-strong))';

export function Donut({ data, total, label }: { data: Array<{ key: string; value: number }>; total: number; label: string }) {
  const size = 148;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = data.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${data.map((d) => `${humanize(d.key)} ${d.value}`).join(', ')}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-raised))" strokeWidth={stroke} />
      {data.map((d, i) => {
        const len = total ? (d.value / total) * c : 0;
        const dash = Math.max(len - gap, 0.5);
        const el = (
          <motion.circle
            key={d.key}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={categoryColor(d.key)}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="47%" textAnchor="middle" className="fill-fg font-mono" style={{ fontSize: 26, fontWeight: 500 }}>
        {total}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-[rgb(var(--text-muted))]" style={{ fontSize: 11 }}>
        {label}
      </text>
    </svg>
  );
}

export function HistoryBars({ data }: { data: Array<{ date: string; completed: number; partial: number; failed: number; other: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.completed + d.partial + d.failed + d.other));
  const height = 132;
  const segments: Array<{ key: 'completed' | 'partial' | 'failed' | 'other'; color: string; label: string }> = [
    { key: 'completed', color: 'rgb(var(--accent))', label: 'Completed' },
    { key: 'partial', color: 'rgb(var(--warning))', label: 'Partial' },
    { key: 'failed', color: 'rgb(var(--danger))', label: 'Failed or blocked' },
    { key: 'other', color: 'rgb(var(--border-strong))', label: 'Cancelled or running' }
  ];
  const active = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-fg-2" aria-live="polite">
          {active
            ? `${new Date(active.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} · ${active.completed + active.partial + active.failed + active.other} runs`
            : `${data.reduce((a, d) => a + d.completed + d.partial + d.failed + d.other, 0)} runs · 14 days`}
        </span>
      </div>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-dashed border-line/70" />
          ))}
        </div>
        <div className="relative flex h-full items-end gap-1.5" role="img" aria-label="Runs per day for the last 14 days">
          {data.map((d, i) => {
            const total = d.completed + d.partial + d.failed + d.other;
            return (
              <button
                key={d.date}
                className="group flex h-full flex-1 flex-col justify-end focus:outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.date}: ${d.completed} completed, ${d.partial} partial, ${d.failed} failed`}
              >
                <motion.div
                  className={cx('flex w-full flex-col-reverse overflow-hidden rounded-[3px] transition-opacity', hover !== null && hover !== i && 'opacity-40')}
                  initial={{ height: 0 }}
                  animate={{ height: `${(total / max) * 100}%` }}
                  transition={{ duration: 0.4, delay: i * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ minHeight: total ? 3 : 0 }}
                >
                  {segments.map((s) => (d[s.key] ? <div key={s.key} style={{ flex: d[s.key], background: s.color }} /> : null))}
                </motion.div>
                {!total && <div className="h-[2px] w-full rounded bg-line-strong/60" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] text-fg-3">
        <span>{new Date(data[0]?.date ?? Date.now()).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
