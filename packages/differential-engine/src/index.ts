import crypto from 'node:crypto';
import type {
  ExtractedCommercialValue,
  DifferenceFindingRecord,
  FindingType,
  FindingSeverity,
  FindingClassification
} from '@mirror/contracts';

export interface CommercialComparisonInput {
  experimentId: string;
  baselineObservationId: string;
  comparisonObservationId: string;
  baselineValues: ExtractedCommercialValue[];
  comparisonValues: ExtractedCommercialValue[];
}

export function parsePrice(text: string): { amount: number | null; currency: string | null } {
  const match = text.match(/([$€£¥])\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return { amount: null, currency: null };

  const currencyMap: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY'
  };

  return {
    amount: parseFloat(match[2]),
    currency: currencyMap[match[1]] || match[1]
  };
}

export function compareCommercialObservations(
  input: CommercialComparisonInput
): DifferenceFindingRecord[] {
  const findings: DifferenceFindingRecord[] = [];

  const baselineMap = new Map<string, ExtractedCommercialValue>();
  for (const item of input.baselineValues) {
    baselineMap.set(item.label.toLowerCase(), item);
  }

  for (const compItem of input.comparisonValues) {
    const labelKey = compItem.label.toLowerCase();
    const baseItem = baselineMap.get(labelKey);

    // Case 1: Additional item / fee introduced in comparison session
    if (!baseItem) {
      if (compItem.amount !== null && compItem.amount > 0) {
        findings.push({
          id: crypto.randomUUID(),
          experimentId: input.experimentId,
          baselineObservationId: input.baselineObservationId,
          comparisonObservationId: input.comparisonObservationId,
          type: compItem.label.toLowerCase().includes('fee')
            ? 'fee_difference'
            : 'price_difference',
          severity: 'high',
          confidence: compItem.confidence,
          classification: 'confirmed_observation',
          description: `Discovered additional line item '${compItem.label}' of ${compItem.currency ?? ''} ${compItem.amount.toFixed(2)} present only in comparison session.`,
          evidenceReferences: [input.comparisonObservationId],
          createdAt: new Date().toISOString()
        });
      }
      continue;
    }

    // Case 2: Currency mismatch
    if (baseItem.currency && compItem.currency && baseItem.currency !== compItem.currency) {
      findings.push({
        id: crypto.randomUUID(),
        experimentId: input.experimentId,
        baselineObservationId: input.baselineObservationId,
        comparisonObservationId: input.comparisonObservationId,
        type: 'price_difference',
        severity: 'critical',
        confidence: 0.95,
        classification: 'confirmed_observation',
        description: `Currency discrepancy for '${compItem.label}': Baseline is ${baseItem.currency}, comparison is ${compItem.currency}.`,
        evidenceReferences: [input.baselineObservationId, input.comparisonObservationId],
        createdAt: new Date().toISOString()
      });
      continue;
    }

    // Case 3: Price amount difference
    if (
      baseItem.amount !== null &&
      compItem.amount !== null &&
      Math.abs(baseItem.amount - compItem.amount) > 0.001
    ) {
      const diff = compItem.amount - baseItem.amount;
      findings.push({
        id: crypto.randomUUID(),
        experimentId: input.experimentId,
        baselineObservationId: input.baselineObservationId,
        comparisonObservationId: input.comparisonObservationId,
        type: 'price_difference',
        severity: Math.abs(diff) > 10 ? 'high' : 'medium',
        confidence: Math.min(baseItem.confidence, compItem.confidence),
        classification: 'confirmed_observation',
        description: `Price difference observed for '${compItem.label}': Baseline was ${baseItem.currency ?? ''} ${baseItem.amount.toFixed(2)}, comparison is ${compItem.currency ?? ''} ${compItem.amount.toFixed(2)} (delta: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}).`,
        evidenceReferences: [input.baselineObservationId, input.comparisonObservationId],
        createdAt: new Date().toISOString()
      });
    }
  }

  return findings;
}
