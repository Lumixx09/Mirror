export type InvestigationStatus =
  | 'draft'
  | 'ready'
  | 'queued'
  | 'running'
  | 'analysing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type RunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'analysing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelling'
  | 'cancelled'
  | 'blocked';

export type SessionRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

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

export type FindingClassification = 'confirmed_observation' | 'supported_interpretation' | 'hypothesis';

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

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

/** Element selector. Resolution priority: testId > role(+name) > label > placeholder > text > css. */
export interface ElementSelector {
  testId?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  css?: string;
}

export type JourneyStepType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'waitFor'
  | 'capture';

export interface JourneyStep {
  type: JourneyStepType;
  /** navigate: absolute URL or path relative to the investigation target. */
  url?: string;
  selector?: ElementSelector;
  /** fill/select value. */
  value?: string;
  /** capture: checkpoint name used to align observations across sessions. */
  name?: string;
  timeoutMs?: number;
  /** Human-readable description shown in the timeline. */
  description?: string;
}

export interface JourneyDefinition {
  name: string;
  version: number;
  steps: JourneyStep[];
}

export interface StepExecutionResult {
  sequence: number;
  type: JourneyStepType;
  description: string;
  status: 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
  durationMs: number;
  url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export type CommercialKind =
  | 'product_price'
  | 'subtotal'
  | 'total'
  | 'fee'
  | 'shipping'
  | 'tax'
  | 'discount'
  | 'subscription'
  | 'line_item';

/** Element bounds in document coordinates (aligned with full-page screenshots). */
export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ExtractionSource = 'test_id' | 'structured_data' | 'semantic_row' | 'visible_text';

export interface ExtractedCommercialValue {
  /** Stable alignment key across sessions (normalized label + kind). */
  key: string;
  label: string;
  kind: CommercialKind;
  amount: number | null;
  currency: string | null;
  recurring: boolean;
  rawText: string;
  sourceLocator: string;
  source: ExtractionSource;
  box?: ElementBox;
  confidence: number;
  /** Non-empty when the extraction is ambiguous. */
  uncertainty?: string;
}

export interface FormControlObservation {
  key: string;
  label: string;
  controlType: 'checkbox' | 'radio' | 'select';
  checked?: boolean;
  value?: string;
  sourceLocator: string;
  box?: ElementBox;
}

export interface NetworkRequestObservation {
  url: string;
  method: string;
  resourceType: string;
  status: number | null;
  durationMs: number | null;
  failure?: string;
}

export interface PageObservation {
  checkpoint: string;
  url: string;
  title: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  /** Normalized visible text lines (raw text is preserved in the DOM artifact). */
  textLines: string[];
  headings: string[];
  commercialValues: ExtractedCommercialValue[];
  formControls: FormControlObservation[];
  normalizationVersion: number;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface FindingSide {
  observationId: string;
  sessionId: string;
  value: string | null;
  rawText?: string;
  sourceLocator?: string;
}

export interface DifferenceFindingRecord {
  id: string;
  experimentId: string;
  executionRunId: string;
  baselineSessionId: string;
  comparisonSessionId: string;
  checkpoint: string;
  subjectKey: string;
  baselineObservationId?: string;
  comparisonObservationId?: string;
  type: FindingType;
  severity: FindingSeverity;
  confidence: number;
  confidenceRationale: string[];
  classification: FindingClassification;
  description: string;
  evidenceReferences: string[];
  details: {
    subject: string;
    baseline: FindingSide | null;
    comparison: FindingSide | null;
    delta?: number;
    currency?: string | null;
    relatedFindingIds?: string[];
  };
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

// ---------------------------------------------------------------------------
// Realtime events
// ---------------------------------------------------------------------------

export type MirrorEventType =
  | 'experiment:queued'
  | 'experiment:started'
  | 'session:started'
  | 'session:progress'
  | 'observation:captured'
  | 'session:completed'
  | 'session:failed'
  | 'analysis:started'
  | 'finding:created'
  | 'experiment:completed'
  | 'experiment:failed';

export interface MirrorEvent<T = Record<string, unknown>> {
  event: MirrorEventType;
  runId: string;
  experimentId: string;
  sessionId?: string;
  timestamp: string;
  payload: T;
}

export const EVENTS_CHANNEL = 'mirror:events';
export const RUN_QUEUE_NAME = 'experiment-runs';
export const NORMALIZATION_VERSION = 1;
