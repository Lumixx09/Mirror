import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from 'motion/react';
import { cx } from './ui';

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Fade and rise into view once, when scrolled into the viewport. */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const Comp = motion[as];
  return (
    <Comp className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay, ease }}>
      {children}
    </Comp>
  );
}

/** Container that staggers its <StaggerItem> children when it enters the viewport (or immediately). */
export function Stagger({ children, className, gap = 0.06, inView = true, as = 'div' }: { children: ReactNode; className?: string; gap?: number; inView?: boolean; as?: 'div' | 'ul' | 'ol' | 'section' | 'tbody' }) {
  const Comp = motion[as];
  const variants = { hidden: {}, show: { transition: { staggerChildren: gap } } };
  return (
    <Comp className={className} variants={variants} initial="hidden" {...(inView ? { whileInView: 'show', viewport: { once: true, margin: '-40px' } } : { animate: 'show' })}>
      {children}
    </Comp>
  );
}

export const staggerItem = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } } };

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'section' | 'tr' }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={staggerItem}>
      {children}
    </Comp>
  );
}

/** Animates from 0 to a real value the first time it becomes visible, then follows later changes. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString(), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const current = useRef(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration: 0.9,
      ease,
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      }
    });
    return () => controls.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={cx('tabular-nums', className)} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}

/** Card with a soft light that follows the pointer, plus a subtle lift on hover. */
export function SpotlightCard({ children, className, as = 'div', lift = true }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'section'; lift?: boolean }) {
  const Comp = motion[as];
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const background = useMotionTemplate`radial-gradient(320px circle at ${mx}px ${my}px, rgb(var(--accent) / 0.10), transparent 70%)`;
  return (
    <Comp
      className={cx('group relative overflow-hidden', className)}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - rect.left);
        my.set(e.clientY - rect.top);
      }}
      onPointerLeave={() => {
        mx.set(-200);
        my.set(-200);
      }}
      whileHover={lift ? { y: -3 } : undefined}
      transition={{ duration: 0.2, ease }}
    >
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background }} />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] border border-accent/0 transition-colors duration-300 group-hover:border-accent/25" />
      <div className="relative">{children}</div>
    </Comp>
  );
}

/** 3D tilt that follows the pointer with spring physics. */
export function Tilt({ children, className, max = 8, base = 0 }: { children: ReactNode; className?: string; max?: number; base?: number }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), { stiffness: 160, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [base - max, base + max]), { stiffness: 160, damping: 18 });
  return (
    <motion.div
      className={className}
      style={reduce ? { transform: `perspective(1100px) rotateY(${base}deg)` } : { rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Vertical parallax for an element relative to a scroll container (window by default). */
export function useParallax(target: RefObject<HTMLElement | null>, distance = 80, container?: RefObject<HTMLElement | null>): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target, container, offset: ['start end', 'end start'] });
  return useTransform(scrollYProgress, [0, 1], [distance, -distance]);
}

export function Parallax({ children, distance = 60, className }: { children: ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const y = useParallax(ref, distance);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/** Thin accent progress bar showing how far the page has been scrolled. */
export function ScrollProgress({ container }: { container?: RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll(container ? { container } : undefined);
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 24 });
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-accent via-accent-hover to-info" style={{ scaleX }} />;
}

/** Magnetic hover: the element drifts slightly toward the pointer. */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const x = useSpring(0, { stiffness: 220, damping: 16 });
  const y = useSpring(0, { stiffness: 220, damping: 16 });
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cx('inline-block', className)}
      style={reduce ? undefined : { x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Splits a line into words that rise in sequence. */
export function SplitWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((word, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className="inline-block" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.7, delay: delay + i * 0.06, ease }}>
            {word}
            {i < text.split(' ').length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
