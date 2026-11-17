import { describe, expect, it } from 'vitest';
import { classifyKind, extractCommercialValues, extractFormControls, stripMoney, type RawPageSignals } from '../src/index';

function signals(partial: Partial<RawPageSignals>): RawPageSignals {
  return {
    url: 'http://store.test/checkout',
    title: 'Checkout',
    bodyText: '',
    headings: [],
    moneyCandidates: [],
    formControls: [],
    structuredOffers: [],
    ...partial
  };
}

describe('extractCommercialValues', () => {
  it('derives labels from the surrounding row, not from hardcoded names', () => {
    const values = extractCommercialValues(
      signals({
        moneyCandidates: [
          { elementText: '$8.00', rowText: 'Booking Handling Fee $8.00', testId: null, rowTestId: null, ariaLabel: null, nearestHeading: 'Summary', locator: 'div > span:nth-of-type(2)' },
          { elementText: '€5,00/mo', rowText: 'Premium Care €5,00/mo', testId: null, rowTestId: null, ariaLabel: null, nearestHeading: 'Summary', locator: 'div:nth-of-type(2) > span' },
          { elementText: 'Total $57.00', rowText: 'Total $57.00', testId: 'grand', rowTestId: null, ariaLabel: null, nearestHeading: 'Summary', locator: '[data-testid="grand"]' }
        ]
      })
    );
    expect(values.map((v) => [v.key, v.amount, v.currency, v.recurring, v.source])).toEqual([
      ['fee:booking handling fee', 8, 'USD', false, 'semantic_row'],
      ['subscription:premium care', 5, 'EUR', true, 'semantic_row'],
      ['total:total', 57, 'USD', false, 'test_id']
    ]);
  });

  it('falls back to the nearest heading and marks the extraction uncertain', () => {
    const [v] = extractCommercialValues(
      signals({
        moneyCandidates: [
          { elementText: '$49.00', rowText: '$49.00', testId: null, rowTestId: null, ariaLabel: null, nearestHeading: 'Widget Pro', locator: 'div.price' }
        ]
      })
    );
    expect(v.label).toBe('Widget Pro');
    expect(v.source).toBe('visible_text');
    expect(v.uncertainty).toMatch(/heading/);
    expect(v.confidence).toBeLessThan(0.6);
  });

  it('keeps alignment keys unique when a label repeats', () => {
    const c = { elementText: '$1.00', rowText: 'Item $1.00', testId: null, rowTestId: null, ariaLabel: null, nearestHeading: null, locator: 'x' };
    const keys = extractCommercialValues(signals({ moneyCandidates: [c, c] })).map((v) => v.key);
    expect(keys).toEqual(['line_item:item', 'line_item:item#2']);
  });

  it('reads JSON-LD offers', () => {
    const [v] = extractCommercialValues(signals({ structuredOffers: [{ name: 'Key', price: '49.00', currency: 'USD' }] }));
    expect(v).toMatchObject({ kind: 'product_price', amount: 49, currency: 'USD', source: 'structured_data' });
  });
});

describe('helpers', () => {
  it('stripMoney removes the amount and period suffix', () => {
    expect(stripMoney('Enroll in Protection ($19.99/mo)', '$19.99')).toBe('Enroll in Protection');
  });

  it.each([
    ['Subtotal', false, 'subtotal'],
    ['Order total', false, 'total'],
    ['Service fee', false, 'fee'],
    ['Delivery', false, 'shipping'],
    ['VAT', false, 'tax'],
    ['Gold plan', true, 'subscription'],
    ['Widget', false, 'line_item']
  ] as const)('classifies %s', (label, recurring, kind) => {
    expect(classifyKind(label, recurring, '')).toBe(kind);
  });

  it('records checkbox default state', () => {
    const [c] = extractFormControls(
      signals({ formControls: [{ controlType: 'checkbox', label: 'Add insurance', checked: true, locator: '#ins' }] })
    );
    expect(c).toMatchObject({ key: 'checkbox:add insurance', checked: true });
  });
});
