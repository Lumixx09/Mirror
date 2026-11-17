import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Binary, FileCheck2, Fingerprint, GitCompareArrows, Layers3, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth';
import { MirrorAxis, MirrorLockup, MirrorMark } from '../components/brand';
import { Magnetic, Reveal, ScrollProgress, SplitWords, SpotlightCard, Stagger, StaggerItem, Tilt } from '../components/motion';
import { cx } from '../components/ui';

const ease = [0.2, 0.8, 0.2, 1] as const;

function Nav() {
  const { user } = useAuth();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));
  return (
    <motion.header
      className={cx('sticky top-0 z-30 border-b transition-colors duration-300', scrolled ? 'border-line/80 bg-bg/85 backdrop-blur-md' : 'border-transparent bg-transparent')}
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease }}
    >
      <div className={cx('mx-auto flex max-w-7xl items-center gap-8 px-6 transition-[height] duration-300', scrolled ? 'h-14' : 'h-[72px]')}>
        <Link to="/" aria-label="MIRROR home" className="transition-opacity hover:opacity-90">
          <MirrorLockup height={scrolled ? 30 : 36} className="transition-[height] duration-300" />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 text-[13px] text-fg-2 md:flex">
          {[
            ['#method', 'Method'],
            ['#evidence', 'Evidence'],
            ['#principles', 'Principles']
          ].map(([href, label]) => (
            <a key={href} href={href} className="group relative rounded px-3 py-1.5 transition-colors hover:text-fg">
              {label}
              <span className="absolute inset-x-3 -bottom-px h-px origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to="/app" className="btn-primary">
              Open workstation <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link to="/register" className="btn-primary">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}

/** Hero artwork with pointer tilt, idle float and scroll parallax. Source: Images/Header_Image.png. */
function HeroArt() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0.3, 1], [0, 120]);
  const scale = useTransform(scrollYProgress, [0.3, 1], [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0.55, 0.95], [1, 0.2]);
  return (
    <figure ref={ref} className="relative mx-auto max-w-[1100px]">
      <motion.div style={reduce ? undefined : { y, scale, opacity }}>
        <motion.div initial={{ opacity: 0, scale: 0.94, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease }}>
          <Tilt max={5}>
            <img
              src="/brand/hero-sessions.webp"
              srcSet="/brand/hero-sessions-800.webp 800w, /brand/hero-sessions.webp 1400w"
              sizes="(max-width: 900px) 100vw, 1100px"
              width={1400}
              height={700}
              alt="Two browser sessions of the same product page, split by the MIRROR axis: Session A shows $49.00, Session B shows $57.00."
              className="float-slow mx-auto block h-auto w-full select-none"
              draggable={false}
            />
          </Tilt>
        </motion.div>
      </motion.div>
      <motion.figcaption initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.6 }} className="mt-2 text-center text-[11.5px] text-fg-3">
        Illustration of a finding from MIRROR's controlled demo store: the same checkout journey under two browsing conditions.
      </motion.figcaption>
    </figure>
  );
}

const COMPARED = ['Product price', 'Checkout total', 'Hidden fees', 'Shipping', 'Tax', 'Recurring charges', 'Preselected options', 'Discounts', 'Navigation paths', 'Visible copy', 'Journey outcomes', 'Currency'];

/** Ticker of the signals MIRROR compares (content, not metrics). */
function Ticker() {
  const reduce = useReducedMotion();
  const items = [...COMPARED, ...COMPARED];
  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/60 py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" aria-label={`Compared signals: ${COMPARED.join(', ')}`}>
      <motion.div className="flex w-max gap-10" animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} aria-hidden>
        {items.map((label, i) => (
          <span key={i} className="flex items-center gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.18em] text-fg-3">
            {label}
            <span className="h-3 w-px bg-accent/60" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function Section({ id, eyebrow, title, children, intro }: { id?: string; eyebrow: string; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20 md:py-28">
      <Reveal className="max-w-2xl">
        <div className="eyebrow flex items-center gap-3 text-accent">
          <motion.span className="h-px bg-accent" initial={{ width: 0 }} whileInView={{ width: 28 }} viewport={{ once: true }} transition={{ duration: 0.6, ease }} />
          {eyebrow}
        </div>
        <h2 className="mt-4 font-display text-[40px] leading-[1.04] tracking-[-0.01em] md:text-[52px]">{title}</h2>
        {intro && <p className="mt-4 text-[15px] leading-relaxed text-fg-2">{intro}</p>}
      </Reveal>
      <div className="mt-12">{children}</div>
    </section>
  );
}

const METHOD = [
  { icon: Layers3, title: 'Define conditions', body: 'Configure isolated browser sessions that differ in exactly the variables you want to test: locale, timezone, viewport, headers.' },
  { icon: GitCompareArrows, title: 'Replay one journey', body: 'Every session executes the same versioned journey in its own Playwright context. No shared cookies, storage or cache.' },
  { icon: Binary, title: 'Compare deterministically', body: 'Prices, fees, recurring charges, default selections, destinations and visible text are extracted and compared by rule.' },
  { icon: Fingerprint, title: 'Preserve the evidence', body: 'Screenshots, DOM snapshots and observations are hashed with SHA-256 into an immutable manifest you can re-verify.' }
];

const PRINCIPLES = [
  { icon: Scale, title: 'Observations, not accusations', body: 'MIRROR reports what was observed under which conditions. A difference may have a legitimate cause; the product never infers intent.' },
  { icon: ShieldCheck, title: 'Deterministic source of truth', body: 'Findings come from the comparison engine. Identical inputs always produce identical findings, with documented confidence.' },
  { icon: Sparkles, title: 'AI is optional and read-only', body: 'An AI layer may interpret findings, but it must cite evidence and can never browse, act or overrule the deterministic record.' },
  { icon: FileCheck2, title: 'Authorized targets only', body: 'Every investigation records its authorized scope. Internal addresses, out-of-scope redirects and payment submissions are blocked.' }
];

function EvidenceDemo() {
  return (
    <SpotlightCard className="panel" lift={false}>
      <div className="panel-head">
        <span className="panel-title">Finding · fee difference</span>
        <span className="font-mono text-[11px] text-fg-3">example layout</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <motion.div className="p-5" initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2, ease }}>
          <div className="eyebrow text-accent">Baseline</div>
          <div className="mt-2 font-mono text-[24px] italic text-fg-3">absent</div>
          <div className="mt-2 font-mono text-[11px] text-fg-3">checkout · obs 9345d757</div>
        </motion.div>
        <motion.div className="axis-v axis-live origin-top" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, ease }} aria-hidden />
        <motion.div className="p-5" initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.35, ease }}>
          <div className="eyebrow text-info">Comparison</div>
          <div className="mt-2 font-mono text-[24px]">USD 8.00</div>
          <div className="mt-2 font-mono text-[11px] text-fg-3">[data-testid="fee-item"]</div>
        </motion.div>
      </div>
      <motion.div className="border-t border-line p-5 text-[13px] text-fg-2" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.5 }}>
        The checkout total differs by <span className="font-mono text-danger">+8.00</span>. The difference equals the “Regulatory Compliance Surcharge” line that only the comparison session shows.
      </motion.div>
    </SpotlightCard>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-full overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Nav />

      <section className="relative -mt-[72px] overflow-hidden pt-[72px]">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden />
        <div className="ambient pointer-events-none absolute left-1/2 top-[30%] h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-60 blur-3xl" style={{ background: 'radial-gradient(closest-side, rgb(var(--accent) / 0.16), rgb(var(--info) / 0.06), transparent)' }} aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-16 md:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="eyebrow inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/80 px-3 py-1.5 text-fg-2">
              <MirrorMark size={14} /> The differential testing laboratory for the internet
            </motion.div>
            <h1 className="mt-7 font-display text-[54px] leading-[0.98] tracking-[-0.02em] sm:text-[72px] md:text-[88px]">
              <SplitWords text="See what changes." delay={0.1} />
              <br />
              <span className="italic text-accent">
                <SplitWords text="Prove" delay={0.3} />
              </span>{' '}
              <SplitWords text="what changed." delay={0.36} />
            </h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.55, ease }} className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-fg-2">
              One website. Multiple browsing conditions. One reproducible investigation. MIRROR runs equivalent journeys in isolated browsers, finds what differs, and keeps the evidence.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.7, ease }} className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Magnetic>
                <Link to={user ? '/app/investigations/new' : '/register'} className="btn-primary btn-lg">
                  Start an investigation <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link to={user ? '/app' : '/login'} className="btn-secondary btn-lg">
                {user ? 'Open workstation' : 'Sign in'}
              </Link>
            </motion.div>
          </div>
          <div className="mt-10">
            <HeroArt />
          </div>
        </div>
      </section>

      <Ticker />

      <Section id="method" eyebrow="01 · Method" title="An experiment, not a screenshot diff." intro="MIRROR treats every investigation as a controlled experiment, so the result is reproducible rather than anecdotal.">
        <Stagger as="ol" className="grid gap-3 md:grid-cols-2 lg:grid-cols-4" gap={0.1}>
          {METHOD.map((m, i) => (
            <StaggerItem key={m.title} as="li">
              <SpotlightCard className="h-full rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-raised transition-colors duration-300 group-hover:border-accent/40 group-hover:bg-accent/10">
                    <m.icon className="h-[18px] w-[18px] text-accent transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] text-fg-3">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-[15px] font-semibold">{m.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{m.body}</p>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section id="evidence" eyebrow="02 · Evidence" title={<>Every claim traces back to <span className="italic">captured bytes</span>.</>}>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <EvidenceDemo />
          </Reveal>
          <Stagger as="ul" className="space-y-4 text-[14px]" gap={0.12}>
            {[
              ['Provenance', 'Each finding cites the observation IDs and source locators it was derived from.'],
              ['Integrity', 'Artifacts are immutable; the run manifest can be re-hashed at any time to detect tampering.'],
              ['Honest confidence', 'Confidence is calculated, explained and capped for single runs, never decorative.'],
              ['Portable reports', 'JSON and PDF reports carry their own content digest for independent verification.']
            ].map(([t, b]) => (
              <StaggerItem key={t} as="li" className="group flex gap-4 border-b border-line pb-4">
                <span className="mt-1 h-4 w-px bg-accent transition-all duration-300 group-hover:h-6" aria-hidden />
                <span>
                  <span className="font-semibold">{t}.</span> <span className="text-fg-2">{b}</span>
                </span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      <Section id="principles" eyebrow="03 · Principles" title="Built to be trusted by investigators.">
        <Stagger className="grid gap-4 md:grid-cols-2" gap={0.1}>
          {PRINCIPLES.map((p) => (
            <StaggerItem key={p.title}>
              <SpotlightCard className="h-full rounded-xl border border-line bg-surface p-6">
                <div className="flex gap-4">
                  <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" strokeWidth={1.75} aria-hidden />
                  <div>
                    <h3 className="text-[15px] font-semibold">{p.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{p.body}</p>
                  </div>
                </div>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <Reveal>
          <SpotlightCard className="rounded-2xl border border-line-strong bg-surface px-8 py-16 text-center" lift={false}>
            <MirrorAxis className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" background="linear-gradient(180deg, rgb(var(--accent) / 0.7), rgb(var(--accent) / 0.1), transparent)" glow={false} />
            <h2 className="relative font-display text-[40px] leading-tight md:text-[56px]">Run your first experiment in minutes.</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-[15px] text-fg-2">A controlled demo store ships with MIRROR, so you can see a real fee and a preselected subscription being discovered end to end.</p>
            <div className="relative mt-8 flex justify-center">
              <Magnetic>
                <Link to={user ? '/app/investigations/new?demo=1' : '/register'} className="btn-primary btn-lg">
                  {user ? 'Run the demo scenario' : 'Create account'} <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
            </div>
          </SpotlightCard>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[12px] text-fg-3">
          <span className="flex items-center gap-2">
            <MirrorMark size={18} /> MIRROR · The Differential Testing Laboratory
          </span>
          <span>Test only targets you are authorized to test.</span>
        </div>
      </footer>
    </div>
  );
}
