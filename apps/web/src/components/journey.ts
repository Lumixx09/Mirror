import type { ElementSelector, JourneyStep } from '@mirror/contracts';

// Mirrors describeStep in @mirror/experiment-runner (kept local: the runner depends on Playwright).
function describeSelector(s: ElementSelector | undefined): string {
  if (!s) return '';
  if (s.testId) return `[data-testid="${s.testId}"]`;
  if (s.role) return `${s.role}${s.name ? ` "${s.name}"` : ''}`;
  if (s.label) return `label "${s.label}"`;
  if (s.placeholder) return `placeholder "${s.placeholder}"`;
  if (s.text) return `text "${s.text}"`;
  return s.css ?? '';
}

export function describeStep(step: JourneyStep): string {
  if (step.description) return step.description;
  switch (step.type) {
    case 'navigate':
      return `Navigate to ${step.url ?? 'target'}`;
    case 'capture':
      return `Capture checkpoint "${step.name}"`;
    default:
      return `${step.type} ${describeSelector(step.selector)}`;
  }
}
