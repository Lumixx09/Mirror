import type { JourneyAction } from '@mirror/contracts';

export interface StepExecutionResult {
  stepId: string;
  sequence: number;
  type: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface JourneyExecutionPlan {
  journeyName: string;
  steps: JourneyAction[];
}

export function validateStepSequence(steps: JourneyAction[]): boolean {
  return steps.length > 0 && steps.every((s) => Boolean(s.type));
}
