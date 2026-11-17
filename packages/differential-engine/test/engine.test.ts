import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ExtractedCommercialValue, PageObservation } from '@mirror/contracts';
import { compareSessions, computeConfidence, type SessionEvidence } from '../src/index';

const NOW = '2026-11-17T00:00:00.000Z';

function value(partial: Partial<ExtractedCommercialValue> & Pick<ExtractedCommercialValue, 'key' | 'label' | 'kind'>): ExtractedCommercialValue {
  return {
    amount: 49,
    currency: 'USD',
    recurring: false,
    rawText: partial.label,
    sourceLocator: '[data-testid="x"]',
    source: 'test_id',
    confidence: 0.95,
    ...partial
  };
}

function page(checkpoint: string, overrides: Partial<PageObservation> = {}): PageObservation {
  return {
    checkpoint,
    url: `http://store.test/${checkpoint}`,
    title: checkpoint,
    capturedAt: NOW,
    viewport: { width: 1280, height: 800 },
    textLines: ['Order Summary', 'Hardware Security Key X-1'],
    headings: ['Order Summary'],
    commercialValues: [
      value({ key: 'product_price:hardware security key x-1', label: 'Hardware Security Key X-1', kind: 'product_price' }),
      value({ key: 'total:total amount', label: 'Total Amount', kind: 'total' })
    ],
    formControls: [],
    normalizationVersion: 1,
    ...overrides
  };
}

function session(id: string, checkpoints: Record<string, PageObservation>, extra: Partial<SessionEvidence> = {}): SessionEvidence {
  return {
    sessionId: id,
    sessionName: id === 'base' ? 'Baseline' : `Session ${id}`,
    status: 'completed',
    viewport: { width: 1280, height: 800 },
    steps: [],
    checkpoints: Object.fromEntries(
      Object.entries(checkpoints).map(([name, observation]) => [name, { observationId: `${id}-${name}`, observation }])
    ),
    ...extra
  };
}

const run = (baseline: SessionEvidence, comparison: SessionEvidence) =>
  compareSessions({ experimentId: 'exp', runId: 'run', baseline, comparison, now: NOW });

describe('commercial comparison (demo-shaped fixtures, unit tests only)', () => {
  it('detects an added fee and links it to the total difference', () => {
    const base = session('base', { checkout: page('checkout') });
    const withFee = page('checkout', {
      commercialValues: [
        value({ key: 'product_price:hardware security key x-1', label: 'Hardware Security Key X-1', kind: 'product_price' }),
        value({ key: 'fee:regulatory compliance surcharge', label: 'Regulatory Compliance Surcharge', kind: 'fee', amount: 8 }),
        value({ key: 'total:total amount', label: 'Total Amount', kind: 'total', amount: 57 })
      ]
    });
    const findings = run(base, session('B', { checkout: withFee }));

    const fee = findings.find((f) => f.type === 'fee_difference');
    const total = findings.find((f) => f.subjectKey === 'total:total amount');
    expect(fee?.severity).toBe('high');
    expect(fee?.details.baseline).toBeNull();
    expect(fee?.details.comparison?.value).toBe('USD 8.00');
    expect(total?.details.delta).toBe(8);
    expect(total?.details.relatedFindingIds).toEqual([fee!.id]);
    expect(total?.description).toMatch(/equals "Regulatory Compliance Surcharge"/);
    expect(fee?.evidenceReferences).toEqual(['base-checkout', 'B-checkout']);
  });

  it('detects a preselected subscription as a default-selection difference', () => {
    const control = (checked: boolean) => ({
      key: 'checkbox:enroll in protection ($19.99/mo)',
      label: 'Enroll in Protection ($19.99/mo)',
      controlType: 'checkbox' as const,
      checked,
      sourceLocator: '[data-testid="subscription-toggle"]'
    });
    const findings = run(
      session('base', { product: page('product', { formControls: [control(false)] }) }),
      session('C', { product: page('product', { formControls: [control(true)] }) })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('default_selection_difference');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].description).toMatch(/not selected by default for the baseline but selected/);
  });

  it('does not compare different currencies numerically', () => {
    const eur = page('checkout', {
      commercialValues: [
        value({ key: 'product_price:hardware security key x-1', label: 'Hardware Security Key X-1', kind: 'product_price', currency: 'EUR' }),
        value({ key: 'total:total amount', label: 'Total Amount', kind: 'total', currency: 'EUR', amount: 45 })
      ]
    });
    const findings = run(session('base', { checkout: page('checkout') }), session('E', { checkout: eur }));
    expect(findings.every((f) => f.details.delta === undefined)).toBe(true);
    expect(findings.filter((f) => /shown in USD for the baseline and EUR/.test(f.description))).toHaveLength(2);
  });

  it('treats a missing amount as uncertain, never as zero', () => {
    const unparsed = page('checkout', {
      commercialValues: [
        value({ key: 'product_price:hardware security key x-1', label: 'Hardware Security Key X-1', kind: 'product_price', amount: null }),
        value({ key: 'total:total amount', label: 'Total Amount', kind: 'total' })
      ]
    });
    const findings = run(session('base', { checkout: page('checkout') }), session('U', { checkout: unparsed }));
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('unknown_difference');
    expect(findings[0].classification).toBe('hypothesis');
    expect(findings[0].details.delta).toBeUndefined();
  });

  it('reports checkpoints reached by only one session and lowers confidence for incomplete sessions', () => {
    const findings = run(
      session('base', { product: page('product'), checkout: page('checkout') }),
      session('F', { product: page('product') }, { status: 'failed' })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('journey_difference');
    expect(findings[0].confidence).toBeLessThan(0.7);
  });
});

describe('confidence', () => {
  it('never exceeds 0.90 for a single run and explains itself', () => {
    const c = computeConfidence({ extraction: [0.99], baselineStatus: 'completed', comparisonStatus: 'completed', viewportsMatch: true, viewportSensitive: false });
    expect(c.confidence).toBe(0.9);
    expect(c.rationale.join(' ')).toMatch(/single run/i);
  });
});

// ---------------------------------------------------------------------------
// Property-based invariants (06-DIFFERENTIAL-ENGINE.md section 9)
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom('product_price', 'total', 'fee', 'subscription', 'line_item', 'tax') as fc.Arbitrary<ExtractedCommercialValue['kind']>;
const valueArb = fc.record({
  label: fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,20}$/),
  kind: kindArb,
  amount: fc.option(fc.integer({ min: 0, max: 1_000_000 }).map((c) => c / 100), { nil: null }),
  currency: fc.constantFrom('USD', 'EUR', null),
  recurring: fc.boolean()
});
const observationArb = fc
  .uniqueArray(valueArb, { selector: (v) => `${v.kind}:${v.label.toLowerCase()}`, maxLength: 8 })
  .chain((values) =>
    fc.record({
      values: fc.constant(values),
      lines: fc.array(fc.string({ maxLength: 30 }), { maxLength: 10 }),
      checked: fc.boolean()
    })
  )
  .map(({ values, lines, checked }) =>
    page('checkout', {
      textLines: lines,
      commercialValues: values.map((v) => value({ ...v, key: `${v.kind}:${v.label.toLowerCase()}` })),
      formControls: [{ key: 'checkbox:opt', label: 'opt', controlType: 'checkbox', checked, sourceLocator: '#opt' }]
    })
  );

describe('engine invariants', () => {
  it('identical normalized inputs yield no findings', () => {
    fc.assert(
      fc.property(observationArb, (obs) => {
        expect(run(session('base', { checkout: obs }), session('X', { checkout: structuredClone(obs) }))).toEqual([]);
      })
    );
  });

  it('value order alone does not change the comparison', () => {
    fc.assert(
      fc.property(observationArb, observationArb, (a, b) => {
        const reordered = { ...b, commercialValues: [...b.commercialValues].reverse(), textLines: [...b.textLines].reverse() };
        expect(run(session('base', { checkout: a }), session('X', { checkout: reordered }))).toEqual(
          run(session('base', { checkout: a }), session('X', { checkout: b }))
        );
      })
    );
  });

  it('repeated identical inputs produce identical output (determinism)', () => {
    fc.assert(
      fc.property(observationArb, observationArb, (a, b) => {
        const first = run(session('base', { checkout: a }), session('X', { checkout: b }));
        const second = run(session('base', { checkout: structuredClone(a) }), session('X', { checkout: structuredClone(b) }));
        expect(second).toEqual(first);
        expect(new Set(first.map((f) => f.id)).size).toBe(first.length);
      })
    );
  });

  it('a genuine same-currency price change is always detected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (baseCents, compCents) => {
          fc.pre(baseCents !== compCents);
          const make = (cents: number) =>
            page('checkout', { commercialValues: [value({ key: 'total:total', label: 'Total', kind: 'total', amount: cents / 100 })] });
          const findings = run(session('base', { checkout: make(baseCents) }), session('X', { checkout: make(compCents) }));
          expect(findings).toHaveLength(1);
          expect(findings[0].details.delta).toBeCloseTo((compCents - baseCents) / 100, 2);
        }
      )
    );
  });

  it('every evidence reference resolves to a supplied observation', () => {
    fc.assert(
      fc.property(observationArb, observationArb, (a, b) => {
        const known = new Set(['base-checkout', 'X-checkout']);
        for (const f of run(session('base', { checkout: a }), session('X', { checkout: b }))) {
          for (const ref of f.evidenceReferences) expect(known.has(ref)).toBe(true);
        }
      })
    );
  });
});
