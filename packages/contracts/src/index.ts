export type InvestigationStatus =
  | 'draft'
  | 'ready'
  | 'queued'
  | 'running'
  | 'analysing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SessionRole = 'baseline' | 'comparison';

export type FindingType =
  | 'price_difference'
  | 'fee_difference'
  | 'subscription_difference'
  | 'default_selection_difference'
  | 'content_difference'
  | 'structure_difference'
  | 'journey_difference'
  | 'navigation_difference'
  | 'visual_difference'
  | 'network_difference'
  | 'unknown_difference';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type FindingClassification =
  | 'confirmed_observation'
  | 'supported_interpretation'
  | 'hypothesis';

export interface SessionConfiguration {
  id: string;
  name: string;
  role: SessionRole;
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
  locale?: string;
  timezoneId?: string;
  userAgent?: string;
  extraHeaders?: Record<string, string>;
}

export interface JourneyAction {
  id: string;
  type:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'select'
    | 'check'
    | 'uncheck'
    | 'scroll'
    | 'waitFor'
    | 'waitForNavigation'
    | 'capture'
    | 'extract';
  target?: string;
  value?: string;
  timeoutMs?: number;
}

export interface ExtractedCommercialValue {
  label: string;
  amount: number | null;
  currency: string | null;
  rawText: string;
  sourceLocator?: string;
  confidence: number;
}

export interface DifferenceFindingRecord {
  id: string;
  experimentId: string;
  baselineObservationId?: string;
  comparisonObservationId?: string;
  type: FindingType;
  severity: FindingSeverity;
  confidence: number;
  classification: FindingClassification;
  description: string;
  evidenceReferences: string[];
  createdAt: string;
}

export interface EvidenceManifest {
  manifestVersion: number;
  runId: string;
  generatedAt: string;
  artifacts: Array<{
    artifactId: string;
    type: string;
    storageKey: string;
    sha256: string;
    size: number;
    capturedAt: string;
  }>;
}
