import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { JourneyStep } from '@mirror/contracts';
import type { FindingRecord, SessionRecord } from '../api';
import { categoryColor } from './charts';
import { describeStep } from './journey';
import { ClassificationTag, ConfidenceIndicator, SeverityBadge, cx, formatRelative, humanize } from './ui';

export function FindingRow({ finding, sessionName, active, onSelect, to, investigation }: {
  finding: FindingRecord;
  sessionName: (id: string) => string;
  active?: boolean;
  onSelect?: () => void;
  to?: string;
  investigation?: string;
}) {
  const body = (
    <>
      <span className="mt-[3px] h-[calc(100%-6px)] w-[3px] shrink-0 self-stretch rounded-full transition-[width] duration-200 group-hover:w-[5px]" style={{ background: categoryColor(finding.type) }} aria-hidden />
      <SeverityBadge severity={finding.severity} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-fg-3">
          <span className="font-medium text-fg-2">{humanize(finding.type)}</span>
          <span className="font-mono">@{finding.checkpoint}</span>
          <span>
            {sessionName(finding.comparisonSessionId)} <span className="text-fg-3/70">vs</span> {sessionName(finding.baselineSessionId)}
          </span>
          {investigation && <span className="truncate">· {investigation}</span>}
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-fg">{finding.description}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <ClassificationTag value={finding.classification} />
          <span className="text-[11px] text-fg-3">{finding.evidenceReferences.length} evidence ref{finding.evidenceReferences.length === 1 ? '' : 's'}</span>
          <span className="text-[11px] text-fg-3">{formatRelative(finding.createdAt)}</span>
        </span>
      </span>
      <ConfidenceIndicator value={finding.confidence} />
      {to && <ArrowRight className="h-4 w-4 shrink-0 text-fg-3 transition-all duration-200 group-hover:translate-x-1 group-hover:text-fg" aria-hidden />}
    </>
  );
  const cls = cx('group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150', active ? 'bg-hover' : 'hover:bg-raised/70');
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onSelect} className={cls} aria-current={active}>
      {body}
    </button>
  );
}

/** Standard confounders per finding type. Methodology guidance, not evaluated against the evidence. */
export function alternativeExplanations(finding: FindingRecord): string[] {
  const common = ['A time-dependent change between captures (campaigns, stock, pricing schedules).', 'A server-side A/B test assigning sessions to different variants at random.'];
  switch (finding.type) {
    case 'price_difference':
    case 'fee_difference':
      return [...common, 'Location-, currency- or tax-dependent pricing tied to the configured locale or headers.', 'Different cart contents or options selected earlier in the journey.'];
    case 'subscription_difference':
    case 'default_selection_difference':
      return [...common, 'Saved preferences or prior consent state (sessions start clean, so check storage-state configuration).', 'Layout differences that reveal or hide optional upsells.'];
    case 'content_difference':
      return [...common, 'Localised copy or personalised marketing content.', 'Dynamic content such as timestamps, stock counters or recommendations.'];
    case 'journey_difference':
    case 'navigation_difference':
      return [...common, 'Bot detection or rate limiting affecting one session.', 'A slow page load causing a step timeout rather than a different experience.'];
    default:
      return common;
  }
}

export function confirmationExperiments(finding: FindingRecord): string[] {
  const list = [
    'Rerun the experiment unchanged. A difference that does not repeat is likely temporal or random assignment.',
    'Rerun with the session order reversed to rule out sequencing effects.',
    'Repeat at a different time of day to test for schedule-based changes.'
  ];
  if (['price_difference', 'fee_difference', 'subscription_difference', 'default_selection_difference'].includes(finding.type)) {
    list.push('Vary one condition at a time (locale, timezone, viewport, header) to isolate the variable associated with the difference.');
  }
  return list;
}

export function reproductionSteps(steps: JourneyStep[], session: SessionRecord | undefined, targetUrl: string): ReactNode[] {
  const cfg = session?.configuration;
  const setup = cfg
    ? `Open a fresh browser profile (no cookies or storage) with viewport ${cfg.viewport.width}×${cfg.viewport.height}, locale ${cfg.locale ?? 'default'}, timezone ${cfg.timezoneId ?? 'default'}${
        cfg.extraHeaders ? ` and request headers ${Object.entries(cfg.extraHeaders).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''
      }.`
    : 'Open a fresh browser profile.';
  return [setup, `Start at ${targetUrl}.`, ...steps.map((s) => describeStep(s))];
}
