import type {
  CommercialKind,
  ExtractedCommercialValue,
  ExtractionSource,
  FormControlObservation,
  NetworkRequestObservation,
  PageObservation
} from '@mirror/contracts';
import { parseMoney, redactSecrets, redactUrl } from '@mirror/shared';
import type { RawPageSignals } from './collect';

export { collectPageSignals } from './collect';
export type { RawPageSignals, RawMoneyCandidate, RawFormControl } from './collect';

export const NORMALIZER_VERSION = 1;
const MAX_TEXT_LINES = 400;
const MAX_LINE_LENGTH = 300;

/** Whitespace + Unicode (NFKC) normalisation. Raw text is preserved separately. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Normalize a label into an alignment key fragment. */
export function normalizeLabel(label: string): string {
  return normalizeText(label)
    .toLowerCase()
    .replace(/[:*•·]+/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove the money substring (and an attached "/mo"-style suffix) from a row text to get its label. */
export function stripMoney(rowText: string, matched: string | null): string {
  let label = rowText;
  if (matched) label = label.replace(matched, ' ');
  return normalizeText(
    label
      .replace(/\/\s?(mo|month|yr|year|wk|week)\b/gi, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, '')
  );
}

function humanizeTestId(testId: string): string {
  return testId.replace(/[-_]+/g, ' ').trim();
}

/** Rule-based kind classification. Order matters: the most specific rules come first. */
export function classifyKind(label: string, recurring: boolean, hint: string): CommercialKind {
  const l = `${label} ${hint}`.toLowerCase();
  if (/\bsub-?total\b/.test(l)) return 'subtotal';
  if (/\b(grand\s+)?total\b|amount due|order total/.test(l)) return 'total';
  if (recurring || /subscription|auto-?renew|membership|per month|monthly plan/.test(l)) return 'subscription';
  if (/\b(fee|fees|surcharge|service charge|handling|processing|convenience)\b/.test(l)) return 'fee';
  if (/\b(shipping|delivery|postage)\b/.test(l)) return 'shipping';
  if (/\b(tax|vat|gst|hst)\b/.test(l)) return 'tax';
  if (/\b(discount|coupon|promo|savings?|you save)\b/.test(l)) return 'discount';
  if (/\bprice\b/.test(l)) return 'product_price';
  return 'line_item';
}

const SOURCE_CONFIDENCE: Record<ExtractionSource, number> = {
  test_id: 0.95,
  structured_data: 0.9,
  semantic_row: 0.85,
  visible_text: 0.6
};

export function extractCommercialValues(signals: RawPageSignals): ExtractedCommercialValue[] {
  const values: ExtractedCommercialValue[] = [];

  for (const c of signals.moneyCandidates) {
    const parsed = parseMoney(c.elementText);
    const rowParsed = parseMoney(c.rowText);
    const recurring = parsed.recurring || rowParsed.recurring;
    let label = stripMoney(c.rowText, rowParsed.matched ?? parsed.matched);
    let source: ExtractionSource = c.testId ? 'test_id' : 'semantic_row';

    if (!label) {
      // No descriptive text in the row: fall back to accessible name, test id, or nearest heading.
      label = normalizeText(c.ariaLabel ?? '') || (c.nearestHeading ? normalizeText(c.nearestHeading) : '');
      if (!c.testId) source = 'visible_text';
    }
    if (!label && c.testId) label = humanizeTestId(c.testId);
    if (!label) label = 'unlabelled amount';

    const hint = [c.testId, c.rowTestId].filter(Boolean).map((t) => humanizeTestId(t as string)).join(' ');
    const kind = classifyKind(label, recurring, hint);
    const uncertainty: string[] = [];
    if (parsed.amount === null) uncertainty.push('amount could not be parsed');
    if (parsed.currency === null) uncertainty.push('currency not stated');
    if (source === 'visible_text') uncertainty.push('label inferred from surrounding heading');

    const confidence = Math.max(0.3, SOURCE_CONFIDENCE[source] - uncertainty.length * 0.15);
    values.push({
      key: `${kind}:${normalizeLabel(label)}`,
      label,
      kind,
      amount: parsed.amount,
      currency: parsed.currency,
      recurring,
      rawText: c.rowText,
      sourceLocator: c.locator,
      source,
      box: c.box,
      confidence: Number(confidence.toFixed(2)),
      uncertainty: uncertainty.length ? uncertainty.join('; ') : undefined
    });
  }

  for (const offer of signals.structuredOffers) {
    if (offer.price === null) continue;
    const amount = Number(offer.price);
    const label = offer.name ? normalizeText(offer.name) : 'structured offer';
    values.push({
      key: `product_price:structured:${normalizeLabel(label)}`,
      label,
      kind: 'product_price',
      amount: Number.isFinite(amount) ? amount : null,
      currency: offer.currency,
      recurring: false,
      rawText: `${offer.price} ${offer.currency ?? ''}`.trim(),
      sourceLocator: 'script[type="application/ld+json"]',
      source: 'structured_data',
      confidence: SOURCE_CONFIDENCE.structured_data
    });
  }

  return disambiguateKeys(values);
}

/** Repeated keys on one page get a positional suffix so alignment stays one-to-one. */
function disambiguateKeys<T extends { key: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = (seen.get(item.key) ?? 0) + 1;
    seen.set(item.key, n);
    return n === 1 ? item : { ...item, key: `${item.key}#${n}` };
  });
}

export function extractFormControls(signals: RawPageSignals): FormControlObservation[] {
  return disambiguateKeys(
    signals.formControls.map((c) => {
      const label = normalizeText(c.label) || 'unlabelled control';
      return {
        key: `${c.controlType}:${normalizeLabel(label)}`,
        label,
        controlType: c.controlType,
        checked: c.checked,
        value: c.controlType === 'select' ? c.value : undefined,
        sourceLocator: c.locator,
        box: c.box
      };
    })
  );
}

export function extractTextLines(bodyText: string): string[] {
  const lines: string[] = [];
  for (const raw of bodyText.split(/\n+/)) {
    const line = normalizeText(raw);
    if (!line) continue;
    lines.push(line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line);
    if (lines.length >= MAX_TEXT_LINES) break;
  }
  return lines;
}

export function buildPageObservation(
  signals: RawPageSignals,
  meta: { checkpoint: string; capturedAt: string; viewport: { width: number; height: number } }
): PageObservation {
  return redactSecrets({
    checkpoint: meta.checkpoint,
    url: redactUrl(signals.url),
    title: normalizeText(signals.title),
    capturedAt: meta.capturedAt,
    viewport: meta.viewport,
    textLines: extractTextLines(signals.bodyText),
    headings: signals.headings.map(normalizeText),
    commercialValues: extractCommercialValues(signals),
    formControls: extractFormControls(signals),
    normalizationVersion: NORMALIZER_VERSION
  }) as PageObservation;
}

const RECORDED_RESOURCE_TYPES = new Set(['document', 'xhr', 'fetch', 'script', 'stylesheet', 'image', 'font']);

/** Keep request metadata only; headers and bodies are never stored. Sensitive query values are redacted. */
export function sanitizeNetworkLog(requests: NetworkRequestObservation[]): NetworkRequestObservation[] {
  return requests
    .filter((r) => RECORDED_RESOURCE_TYPES.has(r.resourceType))
    .map((r) => ({
      url: redactUrl(r.url),
      method: r.method,
      resourceType: r.resourceType,
      status: r.status,
      durationMs: r.durationMs,
      failure: r.failure
    }));
}
