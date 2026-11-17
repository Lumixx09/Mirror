import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Ban, Check, CircleDashed, Clock3, Copy, FileQuestion, Loader2, ShieldAlert, WifiOff, X } from 'lucide-react';
import type { FindingSeverity } from '@mirror/contracts';
import { ApiRequestError } from '../api';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export const shortId = (id: string) => id.slice(0, 8);
export const humanize = (value: string) => value.replace(/_/g, ' ');
export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// ---------------------------------------------------------------------------
// Status: glyph + text, never colour alone
// ---------------------------------------------------------------------------

const STATUS: Record<string, { tone: string; icon: 'check' | 'spin' | 'clock' | 'x' | 'ban' | 'warn' | 'idle' | 'shield'; label?: string }> = {
  completed: { tone: 'text-success', icon: 'check' },
  succeeded: { tone: 'text-success', icon: 'check' },
  ready: { tone: 'text-fg-2', icon: 'idle' },
  draft: { tone: 'text-fg-2', icon: 'idle' },
  pending: { tone: 'text-fg-3', icon: 'idle' },
  queued: { tone: 'text-info', icon: 'clock' },
  starting: { tone: 'text-info', icon: 'spin' },
  running: { tone: 'text-accent', icon: 'spin' },
  analysing: { tone: 'text-accent', icon: 'spin', label: 'analysing' },
  cancelling: { tone: 'text-warning', icon: 'spin' },
  partial: { tone: 'text-warning', icon: 'warn' },
  cancelled: { tone: 'text-fg-3', icon: 'ban' },
  skipped: { tone: 'text-fg-3', icon: 'ban' },
  failed: { tone: 'text-danger', icon: 'x' },
  blocked: { tone: 'text-danger', icon: 'shield' }
};

export const ACTIVE_STATUSES = ['queued', 'starting', 'running', 'analysing', 'cancelling'];

export function StatusGlyph({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.ready;
  const cls = cx('h-3.5 w-3.5 shrink-0', s.tone, className);
  switch (s.icon) {
    case 'check':
      return <Check className={cls} strokeWidth={2.5} aria-hidden />;
    case 'spin':
      return <Loader2 className={cx(cls, 'animate-spin')} aria-hidden />;
    case 'clock':
      return <Clock3 className={cls} aria-hidden />;
    case 'x':
      return <X className={cls} strokeWidth={2.5} aria-hidden />;
    case 'ban':
      return <Ban className={cls} aria-hidden />;
    case 'warn':
      return <AlertTriangle className={cls} aria-hidden />;
    case 'shield':
      return <ShieldAlert className={cls} aria-hidden />;
    default:
      return <CircleDashed className={cls} aria-hidden />;
  }
}

export function StatusBadge({ status, subtle = false }: { status: string; subtle?: boolean }) {
  const s = STATUS[status] ?? STATUS.ready;
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider', s.tone, !subtle && 'rounded border border-current/25 bg-current/[0.06] px-1.5 py-[3px]')}>
      <StatusGlyph status={status} className="h-3 w-3" />
      {s.label ?? status}
    </span>
  );
}

const SEVERITY_TONE: Record<FindingSeverity, string> = {
  critical: 'text-danger border-danger/60 bg-danger/15',
  high: 'text-danger border-danger/35 bg-danger/10',
  medium: 'text-warning border-warning/35 bg-warning/10',
  low: 'text-info border-info/35 bg-info/10',
  info: 'text-fg-2 border-line-strong bg-raised'
};
const SEVERITY_BARS: Record<FindingSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <span className={cx('inline-flex h-[22px] w-[74px] shrink-0 items-center justify-between gap-1 rounded border px-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider', SEVERITY_TONE[severity])}>
      {severity}
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cx('w-[2px] rounded-sm bg-current', n <= SEVERITY_BARS[severity] ? 'opacity-100' : 'opacity-20')} style={{ height: 3 + n * 2 }} />
        ))}
      </span>
    </span>
  );
}

const CLASSIFICATION: Record<string, { label: string; tone: string; note: string }> = {
  confirmed_observation: { label: 'Confirmed observation', tone: 'text-success', note: 'Directly observed in captured evidence.' },
  supported_interpretation: { label: 'Supported interpretation', tone: 'text-info', note: 'Inferred from observations; review the reasoning.' },
  hypothesis: { label: 'Hypothesis', tone: 'text-warning', note: 'Not established. Needs confirmation.' }
};

export function ClassificationTag({ value, withNote = false }: { value: string; withNote?: boolean }) {
  const c = CLASSIFICATION[value] ?? { label: humanize(value), tone: 'text-fg-2', note: '' };
  return (
    <span className="inline-flex flex-col">
      <span className={cx('inline-flex items-center gap-1.5 text-[11.5px] font-medium', c.tone)}>
        {value === 'confirmed_observation' ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : <FileQuestion className="h-3 w-3" aria-hidden />}
        {c.label}
      </span>
      {withNote && <span className="text-[11px] text-fg-3">{c.note}</span>}
    </span>
  );
}

/** Segmented confidence meter: 10 segments, value printed alongside so colour is never the only cue. */
export function ConfidenceIndicator({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const filled = Math.round(value * 10);
  const tone = value >= 0.8 ? 'bg-accent' : value >= 0.5 ? 'bg-warning' : 'bg-danger';
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${value.toFixed(2)}`}>
      <span className="flex gap-[2px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cx('h-2.5 w-[3px] rounded-[1px]', i < filled ? tone : 'bg-line-strong')} />
        ))}
      </span>
      {showLabel && <span className="font-mono text-[11.5px] tabular-nums text-fg-2">{value.toFixed(2)}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pb-5 pt-6 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-fg-2">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={cx('min-h-full pb-12', className)}
    >
      {children}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('skeleton block', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cx('h-3', c === 0 ? 'w-1/4' : 'w-1/6')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 px-6 py-10 text-[13px] text-fg-2 lg:px-8">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const offline = error instanceof ApiRequestError && error.code === 'OFFLINE';
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div role="alert" className={cx('flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.06] p-4', !compact && 'mx-6 my-4 lg:mx-8')}>
      {offline ? <WifiOff className="mt-0.5 h-4 w-4 text-danger" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" aria-hidden />}
      <div className="flex-1">
        <div className="text-[13px] font-medium text-danger">{offline ? 'API unreachable' : 'Request failed'}</div>
        <div className="mt-0.5 text-[13px] text-fg-2">{message}</div>
      </div>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-line-strong bg-raised text-fg-3">{icon ?? <CircleDashed className="h-5 w-5" aria-hidden />}</div>
      <div className="text-[14px] font-medium">{title}</div>
      {body && <div className="mt-1 max-w-md text-[13px] text-fg-2">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const tones = {
    info: 'border-info/30 bg-info/[0.06] text-info',
    warning: 'border-warning/30 bg-warning/[0.06] text-warning',
    danger: 'border-danger/30 bg-danger/[0.06] text-danger',
    success: 'border-success/30 bg-success/[0.06] text-success'
  };
  return (
    <div className={cx('rounded-md border px-3.5 py-2.5 text-[12.5px]', tones[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      {title && <div className="font-medium">{title}</div>}
      <div className="text-fg-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence hash
// ---------------------------------------------------------------------------

export function EvidenceHash({ value, chars = 12, label, className }: { value: string; chars?: number; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={value}
      aria-label={`Copy ${label ?? 'value'} ${value}`}
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        })
      }
      className={cx('group inline-flex max-w-full items-center gap-1.5 rounded font-mono text-[11.5px] text-fg-2 transition-colors hover:text-fg', className)}
    >
      {label && <span className="text-fg-3">{label}</span>}
      <span className="truncate">{chars > 0 && value.length > chars ? `${value.slice(0, chars)}…` : value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-success" aria-hidden /> : <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" aria-hidden />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: ReactNode; count?: number }>; value: T; onChange: (id: T) => void; className?: string }) {
  const group = useId();
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-line px-6 lg:px-8', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx('relative flex h-10 items-center gap-2 px-3 text-[13px] transition-colors duration-150', value === tab.id ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
        >
          {tab.label}
          {tab.count !== undefined && <span className="rounded bg-raised px-1.5 font-mono text-[10.5px] text-fg-2">{tab.count}</span>}
          {value === tab.id && <motion.span layoutId={`tab-${group}`} className="absolute inset-x-2 -bottom-px h-[2px] bg-accent" transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; label: ReactNode; title?: string }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cx('inline-flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors duration-150', value === o.id ? 'bg-hover text-fg shadow-[inset_0_0_0_1px_rgb(var(--border-strong))]' : 'text-fg-3 hover:text-fg-2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ label, children, side = 'right' }: { label: string; children: ReactNode; side?: 'right' | 'bottom' }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs text-fg opacity-0 shadow-lg transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'right' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'left-1/2 top-full mt-2 -translate-x-1/2'
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <div className="px-4 py-3 text-xs text-fg-3">{total} total</div>;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between px-4 py-3 text-xs text-fg-3">
      <span>
        Page <span className="font-mono text-fg-2">{page}</span> of <span className="font-mono text-fg-2">{pages}</span> · {total} total
      </span>
      <div className="flex gap-1.5">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title" width={420}>
      <div className="p-5">
        <h2 id="confirm-title" className="text-[15px] font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-[13px] text-fg-2">{body}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy} autoFocus>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Accessible modal: focus moves in, Escape closes, focus returns to the trigger. */
export function Modal({ open, onClose, children, labelledBy, width = 560, align = 'center' }: { open: boolean; onClose: () => void; children: ReactNode; labelledBy: string; width?: number; align?: 'center' | 'top' }) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[autofocus], input, button, [tabindex]');
      el?.focus();
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className={cx('fixed inset-0 z-50 flex justify-center px-4', align === 'top' ? 'items-start pt-[12vh]' : 'items-center')}>
          <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className="relative w-full overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/50"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Dropdown/popover anchored to its trigger; closes on outside click and Escape. */
export function Popover({ trigger, children, align = 'right', side = 'bottom', width = 320, label }: { trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; side?: 'top' | 'bottom'; width?: number; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className={cx('absolute z-40 overflow-hidden', side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2', ' rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/50', align === 'right' ? 'right-0' : 'left-0')}
            style={{ width }}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MetricDisplay({ label, value, icon, detail, tone }: { label: string; value: ReactNode; icon?: ReactNode; detail?: ReactNode; tone?: 'accent' | 'danger' }) {
  return (
    <div className="group relative flex items-start gap-3 px-5 py-4">
      {icon && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line-strong bg-raised text-fg-2 transition-colors group-hover:text-fg">{icon}</span>}
      <div className="min-w-0">
        <div className="text-xs text-fg-3">{label}</div>
        <div className={cx('mt-0.5 font-mono text-[26px] font-medium leading-none tracking-tight tabular-nums', tone === 'accent' && 'text-accent', tone === 'danger' && 'text-danger')}>{value}</div>
        {detail && <div className="mt-1.5 text-[11.5px] text-fg-3">{detail}</div>}
      </div>
    </div>
  );
}
