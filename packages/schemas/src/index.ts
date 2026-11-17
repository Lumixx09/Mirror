import { z } from 'zod';

export const TargetUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (url) => {
      try {
        return ['http:', 'https:'].includes(new URL(url).protocol);
      } catch {
        return false;
      }
    },
    { message: 'Only http and https protocols are supported' }
  );

const HeaderNameSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'Invalid header name');
const FORBIDDEN_HEADERS = ['host', 'cookie', 'authorization', 'proxy-authorization', 'content-length'];

export const SessionConfigSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.enum(['baseline', 'comparison']),
  viewport: z
    .object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160)
    })
    .default({ width: 1280, height: 800 }),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  locale: z.string().trim().min(2).max(35).default('en-US'),
  timezoneId: z.string().trim().min(1).max(64).default('America/New_York'),
  userAgent: z.string().max(400).optional(),
  extraHeaders: z
    .record(HeaderNameSchema, z.string().max(512))
    .refine((h) => Object.keys(h).every((k) => !FORBIDDEN_HEADERS.includes(k.toLowerCase())), {
      message: 'Credential and transport headers cannot be configured on sessions'
    })
    .optional()
});

export const ElementSelectorSchema = z
  .object({
    testId: z.string().max(200).optional(),
    role: z.string().max(40).optional(),
    name: z.string().max(200).optional(),
    label: z.string().max(200).optional(),
    placeholder: z.string().max(200).optional(),
    text: z.string().max(200).optional(),
    css: z.string().max(300).optional()
  })
  .refine((s) => Boolean(s.testId || s.role || s.label || s.placeholder || s.text || s.css), {
    message: 'Selector requires at least one of testId, role, label, placeholder, text or css'
  });

const BaseStep = {
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  description: z.string().max(200).optional()
};

export const JourneyStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().max(2048).optional(), ...BaseStep }),
  z.object({ type: z.literal('click'), selector: ElementSelectorSchema, ...BaseStep }),
  z.object({ type: z.literal('fill'), selector: ElementSelectorSchema, value: z.string().max(1000), ...BaseStep }),
  z.object({ type: z.literal('select'), selector: ElementSelectorSchema, value: z.string().max(200), ...BaseStep }),
  z.object({ type: z.literal('check'), selector: ElementSelectorSchema, ...BaseStep }),
  z.object({ type: z.literal('uncheck'), selector: ElementSelectorSchema, ...BaseStep }),
  z.object({ type: z.literal('waitFor'), selector: ElementSelectorSchema, ...BaseStep }),
  z.object({
    type: z.literal('capture'),
    name: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/i, 'Checkpoint names use letters, digits, - and _'),
    ...BaseStep
  })
]);

export const JourneySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    version: z.number().int().min(1).default(1),
    steps: z.array(JourneyStepSchema).min(1).max(50)
  })
  .refine((j) => j.steps.some((s) => s.type === 'capture'), {
    message: 'A journey needs at least one capture step to produce observations'
  })
  .refine(
    (j) => {
      const names = j.steps.filter((s) => s.type === 'capture').map((s) => (s as { name: string }).name);
      return new Set(names).size === names.length;
    },
    { message: 'Capture checkpoint names must be unique' }
  );

export const CreateInvestigationSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    targetUrl: TargetUrlSchema,
    permittedDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(\*\.)?[a-z0-9.-]+$/, 'Permitted domain must be a hostname'),
    authorizationPurpose: z.string().trim().min(10).max(500),
    authorizationAcknowledged: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm you are authorized to test this target' })
    }),
    sessions: z.array(SessionConfigSchema).min(2).max(6),
    journey: JourneySchema
  })
  .refine((v) => v.sessions.filter((s) => s.role === 'baseline').length === 1, {
    message: 'Exactly one session must be the baseline',
    path: ['sessions']
  })
  .refine(
    (v) => {
      const host = new URL(v.targetUrl).hostname.toLowerCase();
      const d = v.permittedDomain.replace(/^\*\./, '');
      return host === d || host.endsWith(`.${d}`);
    },
    { message: 'Target URL must be inside the permitted domain', path: ['permittedDomain'] }
  );

export type CreateInvestigationInput = z.infer<typeof CreateInvestigationSchema>;
export type SessionConfigInput = z.infer<typeof SessionConfigSchema>;
export type JourneyInput = z.infer<typeof JourneySchema>;

export const UpdateInvestigationSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  archived: z.boolean().optional()
});

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(20).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true')
});

const FindingTypeEnum = z.enum([
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
]);

export const FindingQuerySchema = z.object({
  type: FindingTypeEnum.optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  classification: z.enum(['confirmed_observation', 'supported_interpretation', 'hypothesis']).optional()
});
