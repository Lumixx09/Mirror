import { z } from 'zod';

export const TargetUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: 'Only http and https protocols are supported' }
);

export const SessionConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  role: z.enum(['baseline', 'comparison']),
  viewport: z.object({
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(240).max(2160)
  }).default({ width: 1280, height: 800 }),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  locale: z.string().default('en-US'),
  timezoneId: z.string().default('America/New_York'),
  userAgent: z.string().optional(),
  extraHeaders: z.record(z.string()).optional()
});

export const JourneyStepSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.enum([
    'navigate',
    'click',
    'fill',
    'select',
    'check',
    'uncheck',
    'scroll',
    'waitFor',
    'waitForNavigation',
    'capture',
    'extract'
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  timeoutMs: z.number().int().min(100).max(60000).default(30000)
});

export const JourneySchema = z.object({
  name: z.string().min(1),
  version: z.number().int().default(1),
  steps: z.array(JourneyStepSchema).min(1)
});

export const CreateInvestigationSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  targetUrl: TargetUrlSchema,
  permittedDomain: z.string().min(1),
  authorizationPurpose: z.string().min(10),
  sessions: z.array(SessionConfigSchema).min(2),
  journey: JourneySchema
});

export const CommercialExtractionSchema = z.object({
  label: z.string(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  rawText: z.string(),
  sourceLocator: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export const DifferenceFindingSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().uuid(),
  baselineObservationId: z.string().uuid().optional(),
  comparisonObservationId: z.string().uuid().optional(),
  type: z.enum([
    'price_difference',
    'fee_difference',
    'subscription_difference',
    'default_selection_difference',
    'content_difference',
    'structure_difference',
    'journey_difference',
    'navigation_difference',
    'visual_difference',
    'network_difference',
    'unknown_difference'
  ]),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  classification: z.enum([
    'confirmed_observation',
    'supported_interpretation',
    'hypothesis'
  ]),
  description: z.string(),
  evidenceReferences: z.array(z.string()),
  createdAt: z.string()
});
