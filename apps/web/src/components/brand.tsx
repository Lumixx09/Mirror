import { motion, useReducedMotion } from 'motion/react';
import { cx } from './ui';

/** Official MIRROR mark (two mirrored surfaces split by the axis). Source artwork: /Images/Favicon.png. */
export function MirrorMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src={size > 48 ? '/brand/mirror-mark.webp' : '/brand/mirror-mark-64.png'}
      alt=""
      aria-hidden
      width={size}
      height={Math.round(size * 0.924)}
      className={cx('shrink-0 select-none object-contain', className)}
      draggable={false}
    />
  );
}

/** Full horizontal lockup (mark + wordmark + descriptor) for dark surfaces. */
export function MirrorLockup({ height = 40, className }: { height?: number; className?: string }) {
  return (
    <img
      src="/brand/mirror-logo-white.webp"
      alt="MIRROR — The Differential Testing Laboratory"
      height={height}
      width={height * 3}
      style={{ height, width: 'auto' }}
      className={cx('select-none', className)}
      draggable={false}
    />
  );
}

export function MirrorWordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex flex-col leading-none', className)}>
      <span className="text-[14px] font-semibold tracking-[0.28em] text-fg">MIRROR</span>
      <span className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-fg-3">Differential testing lab</span>
    </span>
  );
}

export function MirrorLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <MirrorMark size={30} />
      {!collapsed && <MirrorWordmark />}
    </span>
  );
}

/**
 * Loading mark: the two mirrored halves of the logo close on the axis and separate again.
 * Implemented by clipping the mark into its left and right halves.
 */
export function MirrorLoader({ size = 44, label = 'Loading' }: { size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const t = { duration: 0.9, repeat: Infinity, repeatType: 'mirror' as const, ease: [0.45, 0, 0.2, 1] as const };
  const height = Math.round(size * 0.924);
  const half = (side: 'left' | 'right') => (
    <motion.img
      src="/brand/mirror-mark.webp"
      alt=""
      aria-hidden
      draggable={false}
      className="absolute inset-0 h-full w-full select-none object-contain"
      style={{ clipPath: side === 'left' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)' }}
      animate={reduce ? undefined : side === 'left' ? { x: [-size * 0.08, 0], opacity: [0.7, 1] } : { x: [size * 0.08, 0], opacity: [0.7, 1] }}
      transition={t}
    />
  );
  return (
    <span role="status" aria-label={label} className="relative inline-block" style={{ width: size, height }}>
      {half('left')}
      {half('right')}
    </span>
  );
}

/**
 * The living mirror axis. Position and size come from `className` exactly as before; this only adds life:
 * on load the line slashes down from the top like a drawn blade, then a glint of light travels along it
 * at intervals while the line breathes. Static when the user prefers reduced motion.
 */
export function MirrorAxis({
  className,
  background = 'linear-gradient(180deg, transparent, rgb(var(--accent) / 0.85) 30%, rgb(var(--info) / 0.6) 70%, transparent)',
  glow = true,
  delay = 0.15,
  interval = 3.4
}: {
  className?: string;
  background?: string;
  glow?: boolean;
  delay?: number;
  interval?: number;
}) {
  const reduce = useReducedMotion();
  const blade = { duration: 0.75, delay, ease: [0.75, 0, 0.2, 1] as const };
  return (
    <div className={cx('pointer-events-none', className)} aria-hidden>
      <motion.div
        className={cx('absolute inset-0 origin-top', glow && !reduce && 'axis-live')}
        style={{ background, boxShadow: glow ? '0 0 18px 1px rgb(var(--accent) / 0.35)' : undefined }}
        initial={reduce ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={blade}
      />
      {!reduce && (
        <>
          {/* Blade tip: a bright edge leading the line down on load, then gone. */}
          <motion.span
            className="absolute left-1/2 h-28 w-[3px] -translate-x-1/2 rounded-full"
            style={{ background: 'linear-gradient(180deg, transparent, #fff 70%, rgb(var(--accent)))', boxShadow: '0 0 14px 3px rgb(var(--accent) / 0.75)' }}
            initial={{ top: '-12%', opacity: 1 }}
            animate={{ top: '100%', opacity: [1, 1, 0] }}
            transition={{ ...blade, times: [0, 0.85, 1] }}
          />
          {/* Idle glint travelling down the axis. */}
          <motion.span
            className="absolute left-1/2 h-20 w-[2px] -translate-x-1/2 rounded-full"
            style={{ background: 'linear-gradient(180deg, transparent, rgb(255 255 255 / 0.95), transparent)', boxShadow: '0 0 10px 2px rgb(var(--accent) / 0.55)' }}
            initial={{ top: '-15%', opacity: 0 }}
            animate={{ top: ['-15%', '105%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.4, delay: delay + 1.1, repeat: Infinity, repeatDelay: interval, ease: 'easeInOut', times: [0, 0.15, 0.85, 1] }}
          />
        </>
      )}
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="grid h-full place-items-center bg-bg">
      <MirrorLoader size={52} label="Loading MIRROR" />
    </div>
  );
}
