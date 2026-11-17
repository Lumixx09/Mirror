import type { Locator, Page } from 'playwright';
import type { ElementSelector, JourneyStep, StepExecutionResult } from '@mirror/contracts';
import { TargetBlockedError } from '@mirror/shared';

export type JourneyOutcome = 'completed' | 'failed' | 'cancelled' | 'blocked';

export interface RunJourneyOptions {
  page: Page;
  steps: JourneyStep[];
  /** Investigation target; relative navigate URLs resolve against it. */
  targetUrl: string;
  defaultTimeoutMs: number;
  /** Throws TargetBlockedError when a URL is outside the authorized scope. */
  assertUrlAllowed: (url: string) => Promise<unknown>;
  isCancelled: () => Promise<boolean>;
  onCapture: (checkpoint: string, sequence: number) => Promise<void>;
  onStep?: (result: StepExecutionResult) => Promise<void> | void;
}

export interface JourneyResult {
  outcome: JourneyOutcome;
  steps: StepExecutionResult[];
  error?: string;
}

export function describeSelector(s: ElementSelector | undefined): string {
  if (!s) return '';
  if (s.testId) return `[data-testid="${s.testId}"]`;
  if (s.role) return `${s.role}${s.name ? ` "${s.name}"` : ''}`;
  if (s.label) return `label "${s.label}"`;
  if (s.placeholder) return `placeholder "${s.placeholder}"`;
  if (s.text) return `text "${s.text}"`;
  return s.css ?? '';
}

export function describeStep(step: JourneyStep): string {
  if (step.description) return step.description;
  switch (step.type) {
    case 'navigate':
      return `Navigate to ${step.url ?? 'target'}`;
    case 'capture':
      return `Capture checkpoint "${step.name}"`;
    case 'fill':
      return `Fill ${describeSelector(step.selector)}`;
    case 'select':
      return `Select "${step.value}" in ${describeSelector(step.selector)}`;
    case 'waitFor':
      return `Wait for ${describeSelector(step.selector)}`;
    default:
      return `${step.type[0].toUpperCase()}${step.type.slice(1)} ${describeSelector(step.selector)}`;
  }
}

/** Resolve a selector using the documented priority: testId > role > label > placeholder > text > css. */
export function resolveLocator(page: Page, s: ElementSelector): Locator {
  if (s.testId) return page.getByTestId(s.testId);
  if (s.role) {
    return page.getByRole(s.role as Parameters<Page['getByRole']>[0], s.name ? { name: s.name } : undefined);
  }
  if (s.label) return page.getByLabel(s.label);
  if (s.placeholder) return page.getByPlaceholder(s.placeholder);
  if (s.text) return page.getByText(s.text);
  if (s.css) return page.locator(s.css);
  throw new Error('Selector has no supported strategy');
}

export function resolveNavigationUrl(targetUrl: string, url: string | undefined): string {
  return new URL(url ?? targetUrl, targetUrl).toString();
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Playwright errors include multi-line call logs; keep the first line only.
  return raw.split('\n')[0].slice(0, 300);
}

/**
 * Execute a journey step by step. Stops at the first failed step and marks the rest skipped,
 * so the run record always shows the exact step that failed. Never submits payments: the
 * worker blocks non-GET form submissions at the network layer independently of this runner.
 */
export async function runJourney(opts: RunJourneyOptions): Promise<JourneyResult> {
  const results: StepExecutionResult[] = [];
  let outcome: JourneyOutcome = 'completed';
  let error: string | undefined;

  for (let sequence = 0; sequence < opts.steps.length; sequence++) {
    const step = opts.steps[sequence];
    const description = describeStep(step);

    if (outcome !== 'completed') {
      results.push({ sequence, type: step.type, description, status: 'skipped', startedAt: new Date().toISOString(), durationMs: 0 });
      continue;
    }

    if (await opts.isCancelled()) {
      outcome = 'cancelled';
      error = 'Run cancelled by operator.';
      results.push({ sequence, type: step.type, description, status: 'skipped', startedAt: new Date().toISOString(), durationMs: 0 });
      continue;
    }

    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const timeout = step.timeoutMs ?? opts.defaultTimeoutMs;
    try {
      switch (step.type) {
        case 'navigate': {
          const url = resolveNavigationUrl(opts.targetUrl, step.url);
          await opts.assertUrlAllowed(url);
          await opts.page.goto(url, { waitUntil: 'domcontentloaded', timeout });
          break;
        }
        case 'click':
          await resolveLocator(opts.page, step.selector!).first().click({ timeout });
          await opts.page.waitForLoadState('domcontentloaded', { timeout });
          break;
        case 'fill':
          await resolveLocator(opts.page, step.selector!).first().fill(step.value ?? '', { timeout });
          break;
        case 'select':
          await resolveLocator(opts.page, step.selector!).first().selectOption(step.value ?? '', { timeout });
          break;
        case 'check':
          await resolveLocator(opts.page, step.selector!).first().check({ timeout });
          break;
        case 'uncheck':
          await resolveLocator(opts.page, step.selector!).first().uncheck({ timeout });
          break;
        case 'waitFor':
          await resolveLocator(opts.page, step.selector!).first().waitFor({ state: 'visible', timeout });
          break;
        case 'capture':
          await opts.page.waitForLoadState('domcontentloaded', { timeout });
          await opts.onCapture(step.name!, sequence);
          break;
      }
      const result: StepExecutionResult = {
        sequence,
        type: step.type,
        description,
        status: 'succeeded',
        startedAt,
        durationMs: Date.now() - t0,
        url: opts.page.url()
      };
      results.push(result);
      await opts.onStep?.(result);
    } catch (err) {
      outcome = err instanceof TargetBlockedError ? 'blocked' : 'failed';
      error = `Step ${sequence + 1} (${description}) failed: ${errorMessage(err)}`;
      const result: StepExecutionResult = {
        sequence,
        type: step.type,
        description,
        status: 'failed',
        startedAt,
        durationMs: Date.now() - t0,
        url: opts.page.url(),
        error: errorMessage(err)
      };
      results.push(result);
      await opts.onStep?.(result);
    }
  }

  return { outcome, steps: results, error };
}

/** The demonstration journey for the controlled demo store. It is data, not engine logic. */
export const DEMO_CHECKOUT_JOURNEY = {
  name: 'Product to checkout',
  version: 1,
  steps: [
    { type: 'navigate', description: 'Open product page' },
    { type: 'waitFor', selector: { testId: 'product-price' }, description: 'Wait for product price' },
    { type: 'capture', name: 'product', description: 'Capture product page' },
    { type: 'click', selector: { role: 'button', name: 'Add to cart' }, description: 'Add product to cart' },
    { type: 'waitFor', selector: { testId: 'cart-subtotal' }, description: 'Wait for cart summary' },
    { type: 'capture', name: 'cart', description: 'Capture cart' },
    { type: 'click', selector: { testId: 'checkout' }, description: 'Proceed to checkout' },
    { type: 'waitFor', selector: { testId: 'order-summary' }, description: 'Wait for order summary' },
    { type: 'capture', name: 'checkout', description: 'Capture checkout summary' }
  ] satisfies JourneyStep[]
};
