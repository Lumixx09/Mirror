import type {
  CommercialKind,
  DifferenceFindingRecord,
  ExtractedCommercialValue,
  FindingClassification,
  FindingSeverity,
  FindingType,
  FormControlObservation,
  PageObservation,
  SessionRunStatus,
  StepExecutionResult
} from '@mirror/contracts';
import { deterministicId } from '@mirror/shared';

export const ENGINE_VERSION = 1;

export interface CheckpointObservation {
  observationId: string;
  observation: PageObservation;
}

export interface SessionEvidence {
  sessionId: string;
  sessionName: string;
  status: SessionRunStatus;
  viewport: { width: number; height: number };
  steps: StepExecutionResult[];
  /** Keyed by checkpoint name. */
  checkpoints: Record<string, CheckpointObservation>;
}

export interface ComparisonInput {
  experimentId: string;
  runId: string;
  baseline: SessionEvidence;
  comparison: SessionEvidence;
  /** Injected timestamp keeps output deterministic for identical inputs. */
  now: string;
}

type Draft = Omit<DifferenceFindingRecord, 'id' | 'experimentId' | 'executionRunId' | 'baselineSessionId' | 'comparisonSessionId' | 'createdAt'>;

const KIND_FINDING_TYPE: Record<CommercialKind, FindingType> = {
  product_price: 'price_difference',
  subtotal: 'price_difference',
  total: 'price_difference',
  line_item: 'price_difference',
  discount: 'price_difference',
  shipping: 'fee_difference',
  tax: 'fee_difference',
  fee: 'fee_difference',
  subscription: 'subscription_difference'
};

const KIND_NOUN: Record<CommercialKind, string> = {
  product_price: 'price',
  subtotal: 'subtotal',
  total: 'total',
  line_item: 'line item',
  discount: 'discount',
  shipping: 'shipping charge',
  tax: 'tax',
  fee: 'fee',
  subscription: 'recurring charge'
};

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return 'unparsed amount';
  return `${currency ?? '(no currency)'} ${amount.toFixed(2)}`;
}

/**
 * Severity rules (documented, not a judgement of intent):
 * - critical: never assigned automatically.
 * - high: a charge appears/disappears, or an amount changes by >= 10% or >= 10 units.
 * - medium: an amount changes by >= 2%, a default selection changes, a checkpoint is missing.
 * - low: smaller amount changes, structural differences.
 * - info: visible text differences without commercial meaning.
 */
export function amountSeverity(base: number, comp: number): FindingSeverity {
  const delta = Math.abs(comp - base);
  const relative = base === 0 ? 1 : delta / Math.abs(base);
  if (relative >= 0.1 || delta >= 10) return 'high';
  if (relative >= 0.02) return 'medium';
  return 'low';
}

interface ConfidenceInputs {
  extraction: number[];
  baselineStatus: SessionRunStatus;
  comparisonStatus: SessionRunStatus;
  viewportsMatch: boolean;
  viewportSensitive: boolean;
}

/**
 * Confidence = min(extraction confidence of the involved values)
 *   x 0.7 if either session did not complete (partial observation)
 *   x 0.85 if viewports differ and the comparator is layout-sensitive
 *   capped at 0.9 because a single run cannot exclude temporal confounders.
 */
export function computeConfidence(inputs: ConfidenceInputs): { confidence: number; rationale: string[] } {
  const rationale: string[] = [];
  let confidence = inputs.extraction.length ? Math.min(...inputs.extraction) : 0.9;
  rationale.push(`Extraction reliability ${confidence.toFixed(2)} (lowest of the compared values).`);
  if (inputs.baselineStatus !== 'completed' || inputs.comparisonStatus !== 'completed') {
    confidence *= 0.7;
    rationale.push('Reduced: at least one session did not complete its journey.');
  }
  if (!inputs.viewportsMatch && inputs.viewportSensitive) {
    confidence *= 0.85;
    rationale.push('Reduced: sessions used different viewports, so layout may legitimately differ.');
  }
  if (confidence > 0.9) {
    confidence = 0.9;
    rationale.push('Capped at 0.90: single run; repeat runs are needed to rule out time-based variation.');
  } else {
    rationale.push('Single run; repeat runs are needed to rule out time-based variation.');
  }
  return { confidence: Number(confidence.toFixed(2)), rationale };
}

function side(
  cp: CheckpointObservation,
  sessionId: string,
  value: string | null,
  extra: { rawText?: string; sourceLocator?: string } = {}
) {
  return { observationId: cp.observationId, sessionId, value, ...extra };
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

export function compareCommercialValues(
  checkpoint: string,
  base: CheckpointObservation,
  comp: CheckpointObservation,
  ctx: { baselineSessionId: string; comparisonSessionId: string; comparisonName: string; conf: (values: number[]) => ReturnType<typeof computeConfidence> }
): Draft[] {
  const drafts: Draft[] = [];
  const baseMap = new Map(base.observation.commercialValues.map((v) => [v.key, v]));
  const compMap = new Map(comp.observation.commercialValues.map((v) => [v.key, v]));
  const keys = Array.from(new Set([...baseMap.keys(), ...compMap.keys()])).sort();
  const evidence = [base.observationId, comp.observationId];

  const valueSide = (cp: CheckpointObservation, sessionId: string, v: ExtractedCommercialValue) =>
    side(cp, sessionId, `${formatMoney(v.amount, v.currency)}${v.recurring ? ' (recurring)' : ''}`, {
      rawText: v.rawText,
      sourceLocator: v.sourceLocator
    });

  for (const key of keys) {
    const b = baseMap.get(key);
    const c = compMap.get(key);

    if (!b && c) {
      if (c.amount === 0) continue; // A zero-amount line that only appears on one side is not a charge.
      const { confidence, rationale } = ctx.conf([c.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: KIND_FINDING_TYPE[c.kind],
        severity: 'high',
        confidence,
        confidenceRationale: rationale,
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", ${ctx.comparisonName} shows a ${KIND_NOUN[c.kind]} "${c.label}" of ${formatMoney(c.amount, c.currency)}${c.recurring ? ' (recurring)' : ''} that the baseline session does not show.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: {
          subject: c.label,
          baseline: null,
          comparison: valueSide(comp, ctx.comparisonSessionId, c),
          delta: c.amount ?? undefined,
          currency: c.currency
        }
      });
      continue;
    }

    if (b && !c) {
      if (b.amount === 0) continue;
      const { confidence, rationale } = ctx.conf([b.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: KIND_FINDING_TYPE[b.kind],
        severity: b.kind === 'discount' ? 'high' : 'medium',
        confidence,
        confidenceRationale: rationale,
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", the baseline shows a ${KIND_NOUN[b.kind]} "${b.label}" of ${formatMoney(b.amount, b.currency)} that ${ctx.comparisonName} does not show.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: {
          subject: b.label,
          baseline: valueSide(base, ctx.baselineSessionId, b),
          comparison: null,
          delta: b.amount !== null ? -b.amount : undefined,
          currency: b.currency
        }
      });
      continue;
    }

    if (!b || !c) continue;
    const sides = {
      baseline: valueSide(base, ctx.baselineSessionId, b),
      comparison: valueSide(comp, ctx.comparisonSessionId, c)
    };

    // Missing is not zero: an unparsed amount is an uncertainty, not a difference in price.
    if ((b.amount === null) !== (c.amount === null)) {
      const { confidence, rationale } = ctx.conf([b.confidence, c.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: 'unknown_difference',
        severity: 'low',
        confidence: Math.min(confidence, 0.5),
        confidenceRationale: [...rationale, 'Amount could only be parsed in one session.'],
        classification: 'hypothesis',
        description: `At "${checkpoint}", the amount for "${b.label}" could be read in one session but not the other.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: { subject: b.label, ...sides }
      });
      continue;
    }

    // Currency mismatch is never compared numerically.
    if (b.currency && c.currency && b.currency !== c.currency) {
      const { confidence, rationale } = ctx.conf([b.confidence, c.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: 'price_difference',
        severity: 'medium',
        confidence,
        confidenceRationale: [...rationale, 'Currencies differ, so amounts were not compared numerically.'],
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", "${b.label}" is shown in ${b.currency} for the baseline and ${c.currency} for ${ctx.comparisonName}.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: { subject: b.label, ...sides }
      });
      continue;
    }

    if (b.amount !== null && c.amount !== null && Math.abs(b.amount - c.amount) > 0.001) {
      const delta = Number((c.amount - b.amount).toFixed(2));
      const { confidence, rationale } = ctx.conf([b.confidence, c.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: KIND_FINDING_TYPE[b.kind],
        severity: amountSeverity(b.amount, c.amount),
        confidence,
        confidenceRationale: rationale,
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", the ${KIND_NOUN[b.kind]} "${b.label}" is ${formatMoney(b.amount, b.currency)} for the baseline and ${formatMoney(c.amount, c.currency)} for ${ctx.comparisonName} (${delta > 0 ? '+' : ''}${delta.toFixed(2)}).`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: { subject: b.label, ...sides, delta, currency: b.currency ?? c.currency }
      });
      continue;
    }

    if (b.recurring !== c.recurring) {
      const { confidence, rationale } = ctx.conf([b.confidence, c.confidence]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: 'subscription_difference',
        severity: 'high',
        confidence,
        confidenceRationale: rationale,
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", "${b.label}" is presented as ${b.recurring ? 'recurring' : 'one-off'} for the baseline and ${c.recurring ? 'recurring' : 'one-off'} for ${ctx.comparisonName}.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: evidence,
        details: { subject: b.label, ...sides }
      });
    }
  }
  return drafts;
}

export function compareFormControls(
  checkpoint: string,
  base: CheckpointObservation,
  comp: CheckpointObservation,
  ctx: { baselineSessionId: string; comparisonSessionId: string; comparisonName: string; conf: (values: number[]) => ReturnType<typeof computeConfidence> }
): Draft[] {
  const drafts: Draft[] = [];
  const baseMap = new Map(base.observation.formControls.map((c) => [c.key, c]));
  const compMap = new Map(comp.observation.formControls.map((c) => [c.key, c]));
  const keys = Array.from(new Set([...baseMap.keys(), ...compMap.keys()])).sort();
  const describe = (c: FormControlObservation) =>
    c.controlType === 'select' ? `selected "${c.value ?? ''}"` : c.checked ? 'selected' : 'not selected';

  for (const key of keys) {
    const b = baseMap.get(key);
    const c = compMap.get(key);
    if (b && c) {
      const differs = b.controlType === 'select' ? b.value !== c.value : b.checked !== c.checked;
      if (!differs) continue;
      const { confidence, rationale } = ctx.conf([0.95]);
      const involvesMoney = /[$€£¥₦₹]\s?\d|\d\s?(usd|eur|gbp)|\/mo|per month|subscription|renew/i.test(b.label);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: 'default_selection_difference',
        severity: involvesMoney ? 'high' : 'medium',
        confidence,
        confidenceRationale: [...rationale, 'Control state read directly from the DOM before any interaction with it.'],
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", the option "${b.label}" is ${describe(b)} by default for the baseline but ${describe(c)} for ${ctx.comparisonName}.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: [base.observationId, comp.observationId],
        details: {
          subject: b.label,
          baseline: side(base, ctx.baselineSessionId, describe(b), { sourceLocator: b.sourceLocator }),
          comparison: side(comp, ctx.comparisonSessionId, describe(c), { sourceLocator: c.sourceLocator })
        }
      });
    } else {
      const only = (b ?? c)!;
      const { confidence, rationale } = ctx.conf([0.9]);
      drafts.push({
        checkpoint,
        subjectKey: key,
        type: 'structure_difference',
        severity: 'low',
        confidence,
        confidenceRationale: rationale,
        classification: 'confirmed_observation',
        description: `At "${checkpoint}", the option "${only.label}" is only present for ${b ? 'the baseline' : ctx.comparisonName}.`,
        baselineObservationId: base.observationId,
        comparisonObservationId: comp.observationId,
        evidenceReferences: [base.observationId, comp.observationId],
        details: {
          subject: only.label,
          baseline: b ? side(base, ctx.baselineSessionId, describe(b), { sourceLocator: b.sourceLocator }) : null,
          comparison: c ? side(comp, ctx.comparisonSessionId, describe(c), { sourceLocator: c.sourceLocator }) : null
        }
      });
    }
  }
  return drafts;
}

const MONEY_LINE = /[$€£¥₦₹]\s?\d|\d\s?[€£]|\b(USD|EUR|GBP)\b\s?\d/;
const MAX_TEXT_SAMPLES = 8;

/** Visible text lines added/removed, excluding money lines (covered by the commercial comparator). */
export function compareText(
  checkpoint: string,
  base: CheckpointObservation,
  comp: CheckpointObservation,
  ctx: { baselineSessionId: string; comparisonSessionId: string; comparisonName: string; conf: (values: number[]) => ReturnType<typeof computeConfidence> }
): Draft[] {
  // Lines that are labels of commercial values or form controls are already covered by those comparators.
  const covered = new Set(
    [base, comp].flatMap((o) => [
      ...o.observation.commercialValues.flatMap((v) => [v.label, v.rawText]),
      ...o.observation.formControls.map((c) => c.label)
    ])
  );
  const relevant = (l: string) => !MONEY_LINE.test(l) && !covered.has(l);
  const baseLines = base.observation.textLines.filter(relevant);
  const compLines = comp.observation.textLines.filter(relevant);
  const baseSet = new Set(baseLines);
  const compSet = new Set(compLines);
  // Sorted so that line order alone never changes the finding (order-invariance property).
  const removed = Array.from(new Set(baseLines.filter((l) => !compSet.has(l)))).sort();
  const added = Array.from(new Set(compLines.filter((l) => !baseSet.has(l)))).sort();
  if (!removed.length && !added.length) return [];
  const { confidence, rationale } = ctx.conf([0.9]);
  return [
    {
      checkpoint,
      subjectKey: 'visible-text',
      type: 'content_difference',
      severity: 'info',
      confidence,
      confidenceRationale: rationale,
      classification: 'confirmed_observation',
      description: `At "${checkpoint}", ${added.length} visible text line(s) appear only for ${ctx.comparisonName} and ${removed.length} only for the baseline.`,
      baselineObservationId: base.observationId,
      comparisonObservationId: comp.observationId,
      evidenceReferences: [base.observationId, comp.observationId],
      details: {
        subject: 'Visible text',
        baseline: side(base, ctx.baselineSessionId, removed.slice(0, MAX_TEXT_SAMPLES).join('\n') || null),
        comparison: side(comp, ctx.comparisonSessionId, added.slice(0, MAX_TEXT_SAMPLES).join('\n') || null)
      }
    }
  ];
}

/** Destination path differences. Query strings are recorded in evidence but not compared (they often carry session tokens). */
export function compareNavigation(
  checkpoint: string,
  base: CheckpointObservation,
  comp: CheckpointObservation,
  ctx: { baselineSessionId: string; comparisonSessionId: string; comparisonName: string; conf: (values: number[]) => ReturnType<typeof computeConfidence> }
): Draft[] {
  const path = (u: string) => {
    try {
      const url = new URL(u);
      return `${url.host}${url.pathname}`;
    } catch {
      return u;
    }
  };
  const bp = path(base.observation.url);
  const cp = path(comp.observation.url);
  if (bp === cp) return [];
  const { confidence, rationale } = ctx.conf([0.95]);
  return [
    {
      checkpoint,
      subjectKey: 'destination',
      type: 'navigation_difference',
      severity: 'medium',
      confidence,
      confidenceRationale: rationale,
      classification: 'confirmed_observation',
      description: `At "${checkpoint}", the same journey led the baseline to ${bp} and ${ctx.comparisonName} to ${cp}.`,
      baselineObservationId: base.observationId,
      comparisonObservationId: comp.observationId,
      evidenceReferences: [base.observationId, comp.observationId],
      details: {
        subject: 'Page destination',
        baseline: side(base, ctx.baselineSessionId, base.observation.url),
        comparison: side(comp, ctx.comparisonSessionId, comp.observation.url)
      }
    }
  ];
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Compare one comparison session against the baseline. Pure and deterministic:
 * identical inputs (including `now`) always produce identical output.
 */
export function compareSessions(input: ComparisonInput): DifferenceFindingRecord[] {
  const { baseline, comparison } = input;
  const viewportsMatch =
    baseline.viewport.width === comparison.viewport.width && baseline.viewport.height === comparison.viewport.height;
  const confFor = (viewportSensitive: boolean) => (values: number[]) =>
    computeConfidence({
      extraction: values,
      baselineStatus: baseline.status,
      comparisonStatus: comparison.status,
      viewportsMatch,
      viewportSensitive
    });
  const ctxBase = {
    baselineSessionId: baseline.sessionId,
    comparisonSessionId: comparison.sessionId,
    comparisonName: comparison.sessionName
  };

  const drafts: Draft[] = [];
  const checkpoints = Array.from(
    new Set([...Object.keys(baseline.checkpoints), ...Object.keys(comparison.checkpoints)])
  ).sort();

  for (const checkpoint of checkpoints) {
    const b = baseline.checkpoints[checkpoint];
    const c = comparison.checkpoints[checkpoint];
    if (b && c) {
      drafts.push(
        ...compareCommercialValues(checkpoint, b, c, { ...ctxBase, conf: confFor(false) }),
        ...compareFormControls(checkpoint, b, c, { ...ctxBase, conf: confFor(false) }),
        ...compareNavigation(checkpoint, b, c, { ...ctxBase, conf: confFor(false) }),
        ...compareText(checkpoint, b, c, { ...ctxBase, conf: confFor(true) })
      );
      continue;
    }
    // A checkpoint reached by only one session is a journey difference; failed sessions are never compared as if complete.
    const present = (b ?? c)!;
    const reachedBy = b ? 'the baseline' : comparison.sessionName;
    const missedBy = b ? comparison.sessionName : 'the baseline';
    const { confidence, rationale } = computeConfidence({
      extraction: [0.9],
      baselineStatus: baseline.status,
      comparisonStatus: comparison.status,
      viewportsMatch,
      viewportSensitive: false
    });
    drafts.push({
      checkpoint,
      subjectKey: 'checkpoint-reached',
      type: 'journey_difference',
      severity: 'medium',
      confidence,
      confidenceRationale: rationale,
      classification: 'confirmed_observation',
      description: `Checkpoint "${checkpoint}" was captured by ${reachedBy} but not by ${missedBy}.`,
      baselineObservationId: b?.observationId,
      comparisonObservationId: c?.observationId,
      evidenceReferences: [present.observationId],
      details: {
        subject: `Checkpoint ${checkpoint}`,
        baseline: b ? side(b, baseline.sessionId, 'captured') : null,
        comparison: c ? side(c, comparison.sessionId, 'captured') : null
      }
    });
  }

  // Step outcome differences (e.g. a button exists for one session but not the other)
  const baseSteps = new Map(baseline.steps.map((s) => [s.sequence, s]));
  for (const step of comparison.steps) {
    const bs = baseSteps.get(step.sequence);
    if (!bs || bs.status === step.status) continue;
    const { confidence, rationale } = computeConfidence({
      extraction: [0.9],
      baselineStatus: baseline.status,
      comparisonStatus: comparison.status,
      viewportsMatch,
      viewportSensitive: false
    });
    drafts.push({
      checkpoint: `step-${step.sequence}`,
      subjectKey: `step:${step.sequence}`,
      type: 'journey_difference',
      severity: 'medium',
      confidence,
      confidenceRationale: rationale,
      classification: 'confirmed_observation',
      description: `Step ${step.sequence + 1} (${step.description}) ${bs.status} for the baseline but ${step.status} for ${comparison.sessionName}${step.error ? `: ${step.error}` : ''}.`,
      evidenceReferences: [],
      details: {
        subject: step.description,
        baseline: null,
        comparison: null
      }
    });
  }

  const findings: DifferenceFindingRecord[] = drafts.map((d) => ({
    ...d,
    id: deterministicId(input.runId, baseline.sessionId, comparison.sessionId, d.checkpoint, d.type, d.subjectKey),
    experimentId: input.experimentId,
    executionRunId: input.runId,
    baselineSessionId: baseline.sessionId,
    comparisonSessionId: comparison.sessionId,
    createdAt: input.now
  }));

  linkTotalsToLineItems(findings);

  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.checkpoint.localeCompare(b.checkpoint) ||
      a.subjectKey.localeCompare(b.subjectKey)
  );
}

/**
 * Merge related differences: when a total changes by exactly the sum of line items that appear
 * or disappear at the same checkpoint, link them and say so. This is arithmetic, not inference.
 */
function linkTotalsToLineItems(findings: DifferenceFindingRecord[]): void {
  for (const total of findings) {
    if (!total.subjectKey.startsWith('total:') && !total.subjectKey.startsWith('subtotal:')) continue;
    if (total.details.delta === undefined) continue;
    const contributors = findings.filter(
      (f) =>
        f !== total &&
        f.checkpoint === total.checkpoint &&
        f.details.delta !== undefined &&
        !f.subjectKey.startsWith('total:') &&
        !f.subjectKey.startsWith('subtotal:') &&
        !f.subjectKey.startsWith('subscription:') &&
        (f.details.baseline === null || f.details.comparison === null || f.type === 'fee_difference')
    );
    const sum = Number(contributors.reduce((acc, f) => acc + (f.details.delta ?? 0), 0).toFixed(2));
    if (!contributors.length || Math.abs(sum - total.details.delta) > 0.005) continue;
    total.details.relatedFindingIds = contributors.map((f) => f.id).sort();
    total.description += ` The difference equals ${contributors.map((f) => `"${f.details.subject}"`).join(' + ')}.`;
    for (const f of contributors) {
      f.details.relatedFindingIds = Array.from(new Set([...(f.details.relatedFindingIds ?? []), total.id])).sort();
    }
  }
}

export function severityRank(severity: FindingSeverity): number {
  return SEVERITY_ORDER[severity];
}

export type { FindingClassification };
