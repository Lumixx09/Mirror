import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowUp, Beaker, Braces, Camera, Check, ChevronLeft, ChevronRight, Copy, Globe2, ListOrdered, Loader2, MousePointerClick, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ElementSelector, JourneyStep, JourneyStepType } from '@mirror/contracts';
import { api, ApiRequestError, type CreateInvestigationPayload } from '../api';
import { describeStep } from '../components/journey';
import { useBreadcrumbs } from '../components/shell';
import { Notice, Page, Segmented, cx } from '../components/ui';

interface SessionDraft {
  name: string;
  role: 'baseline' | 'comparison';
  locale: string;
  timezoneId: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  headers: string;
}

const STEPS = [
  { id: 'target', label: 'Target & authorization', icon: Globe2 },
  { id: 'sessions', label: 'Browser sessions', icon: ListOrdered },
  { id: 'journey', label: 'Journey', icon: MousePointerClick },
  { id: 'review', label: 'Review & execute', icon: ShieldCheck }
] as const;

const VIEWPORTS = [
  { label: 'Desktop 1280×800', w: 1280, h: 800 },
  { label: 'Laptop 1440×900', w: 1440, h: 900 },
  { label: 'Tablet 820×1180', w: 820, h: 1180 },
  { label: 'Mobile 390×844', w: 390, h: 844 }
];

const STEP_TYPES: JourneyStepType[] = ['navigate', 'click', 'fill', 'select', 'check', 'uncheck', 'waitFor', 'capture'];
const SELECTOR_KEYS: Array<keyof ElementSelector> = ['testId', 'role', 'label', 'placeholder', 'text', 'css'];

const DEFAULT_JOURNEY: JourneyStep[] = [
  { type: 'navigate', description: 'Open target page' },
  { type: 'capture', name: 'landing', description: 'Capture landing page' }
];

const DEMO_JOURNEY: JourneyStep[] = [
  { type: 'navigate', description: 'Open product page' },
  { type: 'waitFor', selector: { testId: 'product-price' }, description: 'Wait for product price' },
  { type: 'capture', name: 'product', description: 'Capture product page' },
  { type: 'click', selector: { role: 'button', name: 'Add to cart' }, description: 'Add product to cart' },
  { type: 'waitFor', selector: { testId: 'cart-subtotal' }, description: 'Wait for cart summary' },
  { type: 'capture', name: 'cart', description: 'Capture cart' },
  { type: 'click', selector: { testId: 'checkout' }, description: 'Proceed to checkout' },
  { type: 'waitFor', selector: { testId: 'order-summary' }, description: 'Wait for order summary' },
  { type: 'capture', name: 'checkout', description: 'Capture checkout summary' }
];

const newSession = (role: SessionDraft['role'], name: string, headers = ''): SessionDraft => ({
  name,
  role,
  locale: 'en-US',
  timezoneId: 'America/New_York',
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  userAgent: '',
  headers
});

function parseHeaders(text: string): Record<string, string> | undefined {
  const entries = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? ([l.slice(0, i).trim(), l.slice(i + 1).trim()] as const) : null;
    })
    .filter((e): e is readonly [string, string] => e !== null);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function FieldBlock({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journey builder
// ---------------------------------------------------------------------------

function StepEditor({ step, index, total, onChange, onRemove, onMove }: { step: JourneyStep; index: number; total: number; onChange: (s: JourneyStep) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const selKey = (SELECTOR_KEYS.find((k) => step.selector?.[k]) ?? 'testId') as keyof ElementSelector;
  const needsSelector = !['navigate', 'capture'].includes(step.type);
  const isCapture = step.type === 'capture';
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="relative pl-10">
      <span className={cx('absolute left-0 top-3 grid h-7 w-7 place-items-center rounded-md border font-mono text-[11px]', isCapture ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line-strong bg-raised text-fg-2')}>
        {isCapture ? <Camera className="h-3.5 w-3.5" /> : index + 1}
      </span>
      {index < total - 1 && <span className="absolute bottom-[-12px] left-[13px] top-11 w-px bg-line" aria-hidden />}
      <div className={cx('rounded-lg border bg-bg p-3', isCapture ? 'border-accent/30' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={`Step ${index + 1} action`} className="input h-8 w-32" value={step.type} onChange={(e) => onChange({ type: e.target.value as JourneyStepType, description: step.description })}>
            {STEP_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input aria-label={`Step ${index + 1} description`} className="input h-8 min-w-[160px] flex-1" placeholder="Description shown in the timeline" value={step.description ?? ''} onChange={(e) => onChange({ ...step, description: e.target.value })} />
          <div className="flex gap-0.5">
            <button className="icon-btn h-8 w-8" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move step up">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button className="icon-btn h-8 w-8" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move step down">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button className="icon-btn h-8 w-8 hover:text-danger" onClick={onRemove} aria-label="Remove step" disabled={total <= 1}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {(step.type === 'navigate' || needsSelector || isCapture) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {step.type === 'navigate' && <input aria-label="URL or path" className="input h-8 flex-1 font-mono" placeholder="Leave empty for the target URL, or /path" value={step.url ?? ''} onChange={(e) => onChange({ ...step, url: e.target.value || undefined })} />}
            {isCapture && <input aria-label="Checkpoint name" className="input h-8 w-48 font-mono" placeholder="checkpoint-name" value={step.name ?? ''} onChange={(e) => onChange({ ...step, name: e.target.value })} />}
            {needsSelector && (
              <>
                <select aria-label="Selector strategy" className="input h-8 w-32" value={selKey} onChange={(e) => onChange({ ...step, selector: { [e.target.value]: step.selector?.[selKey] ?? '' } })}>
                  {SELECTOR_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input aria-label="Selector value" className="input h-8 min-w-[140px] flex-1 font-mono" placeholder={selKey === 'role' ? 'button' : 'value'} value={step.selector?.[selKey] ?? ''} onChange={(e) => onChange({ ...step, selector: { ...(selKey === 'role' ? { name: step.selector?.name } : {}), [selKey]: e.target.value } })} />
                {selKey === 'role' && <input aria-label="Accessible name" className="input h-8 w-40" placeholder="accessible name" value={step.selector?.name ?? ''} onChange={(e) => onChange({ ...step, selector: { ...step.selector, name: e.target.value } })} />}
                {(step.type === 'fill' || step.type === 'select') && <input aria-label="Value" className="input h-8 w-40" placeholder="value" value={step.value ?? ''} onChange={(e) => onChange({ ...step, value: e.target.value })} />}
              </>
            )}
          </div>
        )}
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewInvestigationPage() {
  useBreadcrumbs([{ label: 'Investigations', to: '/app/investigations' }, { label: 'New investigation' }]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [step, setStep] = useState(params.get('step') === 'journey' ? 2 : 0);
  const [dir, setDir] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [permittedDomain, setPermittedDomain] = useState('');
  const [purpose, setPurpose] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [sessions, setSessions] = useState<SessionDraft[]>([newSession('baseline', 'Baseline'), newSession('comparison', 'Comparison A')]);
  const [journeyName, setJourneyName] = useState('Primary journey');
  const [steps, setSteps] = useState<JourneyStep[]>(DEFAULT_JOURNEY);
  const [journeyView, setJourneyView] = useState<'builder' | 'json'>('builder');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const loadDemo = () => {
    const base = settings.data?.demoStoreUrl ?? 'http://localhost:4001';
    const url = `${base.replace(/\/$/, '')}/product`;
    setTitle('Demo store checkout consistency');
    setDescription('Controlled experiment against the first-party MIRROR demo store. Sessions differ only by an explicit experiment header.');
    setTargetUrl(url);
    setPermittedDomain(new URL(url).hostname);
    setPurpose('First-party controlled demo environment owned by the MIRROR team.');
    setAcknowledged(true);
    setSessions([newSession('baseline', 'Baseline (A)', 'x-mirror-variant: A'), newSession('comparison', 'Session B', 'x-mirror-variant: B'), newSession('comparison', 'Session C', 'x-mirror-variant: C')]);
    setJourneyName('Product to checkout');
    setSteps(DEMO_JOURNEY);
    go(3);
  };

  useEffect(() => {
    if (params.get('demo') === '1' && settings.data) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  const updateSession = (i: number, patch: Partial<SessionDraft>) =>
    setSessions((prev) => prev.map((s, j) => (patch.role === 'baseline' && j !== i ? { ...s, role: 'comparison' } : j === i ? { ...s, ...patch } : s)));

  const baseline = sessions.find((s) => s.role === 'baseline');
  const differs = (s: SessionDraft, key: keyof SessionDraft) => Boolean(baseline && s !== baseline && String(s[key]) !== String(baseline[key]));

  const captures = steps.filter((s) => s.type === 'capture');
  const captureNamesValid = captures.every((s) => /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(s.name ?? '')) && new Set(captures.map((s) => s.name)).size === captures.length;
  const valid = [
    title.trim().length >= 3 && /^https?:\/\/.+/.test(targetUrl) && permittedDomain.trim().length > 0 && purpose.trim().length >= 10 && acknowledged,
    sessions.length >= 2 && sessions.filter((s) => s.role === 'baseline').length === 1 && sessions.every((s) => s.name.trim()),
    captures.length > 0 && captureNamesValid && journeyName.trim().length > 0,
    true
  ];

  const payload = (): CreateInvestigationPayload => ({
    title,
    description: description || undefined,
    targetUrl,
    permittedDomain,
    authorizationPurpose: purpose,
    authorizationAcknowledged: acknowledged,
    sessions: sessions.map((s) => ({
      name: s.name,
      role: s.role,
      locale: s.locale,
      timezoneId: s.timezoneId,
      viewport: { width: Number(s.width), height: Number(s.height) },
      deviceScaleFactor: Number(s.deviceScaleFactor),
      userAgent: s.userAgent || undefined,
      extraHeaders: parseHeaders(s.headers)
    })),
    journey: { name: journeyName, version: 1, steps: steps.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined)) as unknown as JourneyStep) }
  });

  const create = useMutation({
    mutationFn: (run: boolean) => api.createInvestigation(payload(), run),
    onSuccess: (data) => navigate(data.runId ? `/app/runs/${data.runId}` : `/app/investigations/${data.id}`)
  });
  const apiError = create.error instanceof ApiRequestError ? create.error : null;

  const moveStep = (i: number, d: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 pt-6 lg:px-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">New investigation</h1>
          <p className="mt-1 text-[13px] text-fg-2">Define an authorized target, the conditions to compare, and the journey every session will follow.</p>
        </div>
        <button className="btn-secondary" onClick={loadDemo}>
          <Beaker className="h-4 w-4" /> Load demo scenario
        </button>
      </div>

      <div className="grid gap-6 px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <nav aria-label="Creation steps">
          <ol className="relative space-y-1">
            {STEPS.map((s, i) => {
              const done = valid[i] && i < step;
              return (
                <li key={s.id}>
                  <button onClick={() => go(i)} aria-current={i === step ? 'step' : undefined} className={cx('flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left text-[13px] transition-colors', i === step ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-raised')}>
                    <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md border font-mono text-[11px]', i === step ? 'border-accent bg-accent/15 text-accent' : done ? 'border-success/50 text-success' : 'border-line-strong text-fg-3')}>
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 h-1 overflow-hidden rounded bg-raised" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label="Creation progress">
            <motion.div className="h-full bg-accent" animate={{ width: `${((step + 1) / 4) * 100}%` }} transition={{ duration: 0.25 }} />
          </div>
        </nav>

        <div className="panel min-w-0 overflow-hidden">
          <div className="panel-head">
            <span className="panel-title">
              <span className="mr-2 font-mono text-fg-3">0{step + 1}</span>
              {STEPS[step].label}
            </span>
          </div>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -16 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} className="p-5">
              {step === 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock label="Website URL" htmlFor="target" hint="Only http and https. Internal, private and cloud-metadata addresses are blocked." className="md:col-span-2">
                    <input
                      id="target"
                      className="input font-mono"
                      value={targetUrl}
                      placeholder="https://shop.example.com/product/123"
                      onChange={(e) => {
                        setTargetUrl(e.target.value);
                        try {
                          const host = new URL(e.target.value).hostname;
                          if (!permittedDomain || e.target.value.includes(permittedDomain) === false) setPermittedDomain(host);
                        } catch {
                          /* partial input */
                        }
                      }}
                    />
                  </FieldBlock>
                  <FieldBlock label="Investigation title" htmlFor="title">
                    <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checkout fees across locales" />
                  </FieldBlock>
                  <FieldBlock label="Authorized domain scope" htmlFor="domain" hint="Sessions may only navigate within this domain and its subdomains.">
                    <input id="domain" className="input font-mono" value={permittedDomain} onChange={(e) => setPermittedDomain(e.target.value)} placeholder="shop.example.com" />
                  </FieldBlock>
                  <FieldBlock label="Description" htmlFor="desc" className="md:col-span-2">
                    <textarea id="desc" className="input min-h-[64px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What question is this investigation answering?" />
                  </FieldBlock>
                  <FieldBlock label="Authorization basis" htmlFor="purpose" className="md:col-span-2">
                    <textarea id="purpose" className="input min-h-[64px]" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Who authorized this test, and for what purpose" />
                  </FieldBlock>
                  <label className={cx('flex items-start gap-3 rounded-lg border p-3.5 text-[13px] md:col-span-2', acknowledged ? 'border-accent/40 bg-accent/[0.05]' : 'border-line-strong bg-bg')}>
                    <input type="checkbox" className="mt-0.5 accent-[rgb(var(--accent))]" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                    <span>
                      <span className="font-medium">I am authorized to test this target.</span>
                      <span className="block text-fg-2">MIRROR will not bypass access controls, CAPTCHAs or paywalls, and blocks order and payment submissions. This acknowledgement is recorded in the audit log.</span>
                    </span>
                  </label>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-[13px] text-fg-2">Each session runs in its own isolated browser context. Change only the conditions you want to test; differences from the baseline are highlighted.</p>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="table">
                      <caption className="sr-only">Session condition matrix</caption>
                      <thead>
                        <tr>
                          <th>Condition</th>
                          {sessions.map((s, i) => (
                            <th key={i} className={s.role === 'baseline' ? 'text-accent' : ''}>
                              {s.name || `Session ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ['Locale', (s: SessionDraft) => s.locale, 'locale'],
                            ['Timezone', (s: SessionDraft) => s.timezoneId, 'timezoneId'],
                            ['Viewport', (s: SessionDraft) => `${s.width}×${s.height} @${s.deviceScaleFactor}x`, 'width'],
                            ['Headers', (s: SessionDraft) => s.headers.replace(/\n/g, ', ') || '—', 'headers'],
                            ['User agent', (s: SessionDraft) => (s.userAgent ? 'custom' : 'default'), 'userAgent']
                          ] as const
                        ).map(([label, get, key]) => (
                          <tr key={label}>
                            <td className="text-fg-3">{label}</td>
                            {sessions.map((s, i) => {
                              const changed = differs(s, key) || (key === 'width' && (differs(s, 'height') || differs(s, 'deviceScaleFactor')));
                              return (
                                <td key={i} className={cx('mono', changed ? 'bg-accent/[0.08] text-accent' : 'text-fg-2')}>
                                  {get(s)}
                                  {changed && <span className="sr-only"> (differs from baseline)</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {sessions.map((s, i) => (
                      <fieldset key={i} className={cx('rounded-lg border p-4', s.role === 'baseline' ? 'border-accent/40' : 'border-line-strong')}>
                        <legend className="px-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-3">
                          Session {i + 1} · {s.role}
                        </legend>
                        <div className="grid grid-cols-2 gap-3">
                          <FieldBlock label="Session name" htmlFor={`n${i}`}>
                            <input id={`n${i}`} className="input" value={s.name} onChange={(e) => updateSession(i, { name: e.target.value })} />
                          </FieldBlock>
                          <FieldBlock label="Role">
                            <Segmented
                              label={`Session ${i + 1} role`}
                              value={s.role}
                              onChange={(role) => updateSession(i, { role })}
                              options={[
                                { id: 'baseline', label: 'Baseline' },
                                { id: 'comparison', label: 'Comparison' }
                              ]}
                            />
                          </FieldBlock>
                          <FieldBlock label="Browser">
                            <div className="input flex items-center text-fg-2">Chromium (Playwright)</div>
                          </FieldBlock>
                          <FieldBlock label="Viewport preset" htmlFor={`vp${i}`}>
                            <select id={`vp${i}`} className="input" value={`${s.width}x${s.height}`} onChange={(e) => {
                              const [w, h] = e.target.value.split('x').map(Number);
                              updateSession(i, { width: w, height: h });
                            }}>
                              {VIEWPORTS.map((v) => (
                                <option key={v.label} value={`${v.w}x${v.h}`}>
                                  {v.label}
                                </option>
                              ))}
                              {!VIEWPORTS.some((v) => v.w === s.width && v.h === s.height) && <option value={`${s.width}x${s.height}`}>Custom {s.width}×{s.height}</option>}
                            </select>
                          </FieldBlock>
                          <FieldBlock label="Locale" htmlFor={`l${i}`}>
                            <input id={`l${i}`} className={cx('input font-mono', differs(s, 'locale') && 'border-accent/60')} value={s.locale} onChange={(e) => updateSession(i, { locale: e.target.value })} />
                          </FieldBlock>
                          <FieldBlock label="Timezone" htmlFor={`tz${i}`}>
                            <input id={`tz${i}`} className={cx('input font-mono', differs(s, 'timezoneId') && 'border-accent/60')} value={s.timezoneId} onChange={(e) => updateSession(i, { timezoneId: e.target.value })} />
                          </FieldBlock>
                          <FieldBlock label="Device scale factor" htmlFor={`dsf${i}`}>
                            <select id={`dsf${i}`} className="input" value={s.deviceScaleFactor} onChange={(e) => updateSession(i, { deviceScaleFactor: Number(e.target.value) })}>
                              {[1, 2, 3].map((n) => (
                                <option key={n} value={n}>
                                  {n}x
                                </option>
                              ))}
                            </select>
                          </FieldBlock>
                          <FieldBlock label="User agent" htmlFor={`ua${i}`}>
                            <input id={`ua${i}`} className="input font-mono" value={s.userAgent} placeholder="browser default" onChange={(e) => updateSession(i, { userAgent: e.target.value })} />
                          </FieldBlock>
                          <FieldBlock label="Request headers" htmlFor={`hd${i}`} hint="Name: value, one per line. Cookie and authorization headers are rejected." className="col-span-2">
                            <textarea id={`hd${i}`} className={cx('input min-h-[52px] font-mono', differs(s, 'headers') && 'border-accent/60')} value={s.headers} onChange={(e) => updateSession(i, { headers: e.target.value })} />
                          </FieldBlock>
                          <div className="col-span-2">
                            <Notice tone="info">Authorized storage state (signed-in sessions) is not available yet: it requires encrypted credential storage. Sessions start with empty cookies and storage.</Notice>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button className="btn-ghost btn-sm" onClick={() => setSessions((p) => [...p.slice(0, i + 1), { ...s, name: `${s.name} copy`, role: 'comparison' }, ...p.slice(i + 1)])} disabled={sessions.length >= 6}>
                            <Copy className="h-3.5 w-3.5" /> Duplicate
                          </button>
                          {sessions.length > 2 && (
                            <button className="btn-ghost btn-sm hover:text-danger" onClick={() => setSessions((p) => p.filter((_, j) => j !== i))}>
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          )}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  {sessions.length < 6 && (
                    <button className="btn-secondary" onClick={() => setSessions((p) => [...p, newSession('comparison', `Comparison ${String.fromCharCode(64 + p.length)}`)])}>
                      <Plus className="h-4 w-4" /> Add session
                    </button>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <FieldBlock label="Journey name" htmlFor="jn" className="min-w-[220px] flex-1">
                      <input id="jn" className="input" value={journeyName} onChange={(e) => setJourneyName(e.target.value)} />
                    </FieldBlock>
                    <Segmented
                      label="Journey editor"
                      value={journeyView}
                      onChange={(v) => {
                        if (v === 'json') setJsonText(JSON.stringify(steps, null, 2));
                        setJourneyView(v);
                      }}
                      options={[
                        { id: 'builder', label: <><ListOrdered className="h-3.5 w-3.5" /> Builder</> },
                        { id: 'json', label: <><Braces className="h-3.5 w-3.5" /> JSON</> }
                      ]}
                    />
                  </div>
                  {journeyView === 'builder' ? (
                    <>
                      <ol className="space-y-3">
                        <AnimatePresence initial={false}>
                          {steps.map((s, i) => (
                            <StepEditor key={i} step={s} index={i} total={steps.length} onChange={(n) => setSteps((p) => p.map((x, j) => (j === i ? n : x)))} onRemove={() => setSteps((p) => p.filter((_, j) => j !== i))} onMove={(d) => moveStep(i, d)} />
                          ))}
                        </AnimatePresence>
                      </ol>
                      <div className="flex flex-wrap gap-2 pl-10">
                        <button className="btn-secondary btn-sm" onClick={() => setSteps((p) => [...p, { type: 'click', selector: { testId: '' } }])}>
                          <Plus className="h-3.5 w-3.5" /> Add action
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => setSteps((p) => [...p, { type: 'capture', name: `checkpoint-${p.filter((x) => x.type === 'capture').length + 1}` }])}>
                          <Camera className="h-3.5 w-3.5" /> Add capture checkpoint
                        </button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <textarea
                        spellCheck={false}
                        aria-label="Journey steps JSON"
                        className="input min-h-[340px] font-mono text-[12px]"
                        value={jsonText}
                        onChange={(e) => {
                          setJsonText(e.target.value);
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (!Array.isArray(parsed)) throw new Error('Journey must be a JSON array of steps');
                            setSteps(parsed);
                            setJsonError(null);
                          } catch (err) {
                            setJsonError((err as Error).message);
                          }
                        }}
                      />
                      {jsonError && <p className="field-error">{jsonError}</p>}
                    </div>
                  )}
                  {!captureNamesValid && <p className="field-error">Checkpoint names must be unique and use letters, digits, “-” or “_”.</p>}
                  {captures.length === 0 && <p className="field-error">Add at least one capture checkpoint: observations are only recorded at checkpoints.</p>}
                </div>
              )}

              {step === 3 && (
                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                  <div className="space-y-4">
                    <dl className="kv">
                      <dt>Title</dt>
                      <dd>{title || <span className="text-danger">missing</span>}</dd>
                      <dt>Target</dt>
                      <dd className="mono break-all">{targetUrl || <span className="text-danger">missing</span>}</dd>
                      <dt>Authorized scope</dt>
                      <dd className="mono">{permittedDomain} and subdomains</dd>
                      <dt>Acknowledged</dt>
                      <dd>{acknowledged ? 'Yes' : <span className="text-danger">Required</span>}</dd>
                      <dt>Journey</dt>
                      <dd>
                        {journeyName} · {steps.length} steps · {captures.length} checkpoints
                      </dd>
                    </dl>
                    <div className="space-y-1.5">
                      {sessions.map((s) => (
                        <div key={s.name} className={cx('flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]', s.role === 'baseline' ? 'border-accent/40' : 'border-line')}>
                          <span className={cx('font-mono text-[10px] uppercase tracking-wider', s.role === 'baseline' ? 'text-accent' : 'text-info')}>{s.role}</span>
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-auto truncate font-mono text-[11px] text-fg-3">
                            {s.locale} · {s.width}×{s.height}
                            {s.headers ? ` · ${s.headers.replace(/\n/g, ', ')}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow mb-3">What happens when you execute</div>
                    <ol className="space-y-3 text-[13px]">
                      {[
                        `The API re-validates the target and queues one run. The worker validates it again before any navigation.`,
                        `${sessions.length} isolated Chromium contexts start in parallel (bounded by ${settings.data?.limits.maxConcurrency ?? 2} concurrent sessions).`,
                        `Each session follows the same ${steps.length}-step journey and captures ${captures.length} checkpoint${captures.length === 1 ? '' : 's'}: ${captures.map((c) => c.name).join(', ')}.`,
                        'Screenshots, DOM snapshots, observations and network metadata are stored and hashed (SHA-256).',
                        'The deterministic engine compares every comparison session against the baseline and records findings with evidence references.'
                      ].map((t, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-0.5 font-mono text-[11px] text-accent">{String(i + 1).padStart(2, '0')}</span>
                          <span className="text-fg-2">{t}</span>
                        </li>
                      ))}
                    </ol>
                    <ol className="mt-5 space-y-1 border-t border-line pt-4">
                      {steps.map((s, i) => (
                        <li key={i} className={cx('flex gap-2 text-[12px]', s.type === 'capture' ? 'text-accent' : 'text-fg-3')}>
                          <span className="w-5 text-right font-mono">{i + 1}</span> {describeStep(s)}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {apiError && (
                    <div role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] p-3 text-[13px] xl:col-span-2">
                      <div className="font-medium text-danger">{apiError.message}</div>
                      {apiError.details?.map((d) => (
                        <div key={d.path + d.message} className="mt-1 font-mono text-[11px] text-fg-2">
                          {d.path}: {d.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < 3 ? (
              <button className="btn-primary" disabled={!valid[step]} onClick={() => go(step + 1)}>
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={!valid.every(Boolean) || create.isPending} onClick={() => create.mutate(false)}>
                  Save without running
                </button>
                <button className="btn-primary" disabled={!valid.every(Boolean) || create.isPending} onClick={() => create.mutate(true)}>
                  {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create and run experiment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
