import type { ReactNode } from 'react';
import { useBreadcrumbs } from '../components/shell';
import { Page, PageHeader } from '../components/ui';

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line py-7 last:border-0">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-fg-2">{children}</div>
    </section>
  );
}

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-[12px] text-fg">{children}</pre>;

export default function DocsPage() {
  useBreadcrumbs([{ label: 'Documentation' }]);
  return (
    <Page>
      <PageHeader title="Documentation" description="How MIRROR executes experiments, compares observations and records evidence." />
      <div className="max-w-3xl px-6 lg:px-8">
        <Doc id="concepts" title="Concepts">
          <p>
            An <strong className="text-fg">investigation</strong> names an authorized target. Its <strong className="text-fg">experiment</strong> defines browser sessions (one baseline, one or more comparisons) and a versioned <strong className="text-fg">journey</strong>. Each execution is a <strong className="text-fg">run</strong>. At every capture step each session records an <strong className="text-fg">observation</strong>, and the engine compares comparison sessions against the baseline to produce <strong className="text-fg">findings</strong>.
          </p>
        </Doc>
        <Doc id="journeys" title="Journey steps">
          <p>Supported actions: navigate, click, fill, select, check, uncheck, waitFor and capture. A journey must contain at least one capture step; checkpoint names align observations across sessions.</p>
          <Code>{`[
  { "type": "navigate" },
  { "type": "waitFor", "selector": { "testId": "product-price" } },
  { "type": "capture", "name": "product" },
  { "type": "click", "selector": { "role": "button", "name": "Add to cart" } },
  { "type": "capture", "name": "cart" }
]`}</Code>
          <p>Selector priority: testId, then role with accessible name, label, placeholder, text, and CSS as a last resort. A failed step stops that session and is recorded with its error; later steps are marked skipped.</p>
        </Doc>
        <Doc id="comparison" title="What is compared">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Monetary values found in the page: labels come from the surrounding row, accessible name or structured data, never from hardcoded names. Kinds: price, subtotal, total, fee, shipping, tax, discount, subscription.</li>
            <li>Default state of checkboxes, radios and selects before any interaction.</li>
            <li>Destination path at each checkpoint (query strings are recorded but not compared).</li>
            <li>Visible text lines not already explained by a commercial or form finding.</li>
            <li>Checkpoints reached by one session but not another, and step outcome differences.</li>
          </ul>
          <p>Missing amounts are never treated as zero, and different currencies are never compared numerically.</p>
        </Doc>
        <Doc id="confidence" title="Confidence">
          <Code>{`confidence = min(extraction reliability of compared values)
  × 0.7   if either session did not complete
  × 0.85  if viewports differ and the comparator is layout-sensitive
  capped at 0.90 for a single run`}</Code>
          <p>Extraction reliability: test ID 0.95, structured data 0.90, semantic row 0.85, visible text fallback 0.60, reduced for each uncertainty (no currency, unparsed amount).</p>
        </Doc>
        <Doc id="classification" title="Classification and severity">
          <p>
            <strong className="text-fg">Confirmed observation</strong>: directly read from captured evidence. <strong className="text-fg">Supported interpretation</strong>: inferred from observations. <strong className="text-fg">Hypothesis</strong>: not established, such as a value that could only be parsed in one session.
          </p>
          <p>Severity is rule-based and does not imply wrongdoing: a charge that appears or disappears, or an amount change of at least 10% or 10 units, is high; changes of at least 2% and changed defaults are medium; text differences are informational.</p>
        </Doc>
        <Doc id="evidence" title="Evidence integrity">
          <p>Screenshots, DOM snapshots, observation JSON and network metadata are stored as immutable files and hashed with SHA-256. Each run ends with a manifest listing every artifact and its digest. Verification re-reads the stored bytes and recomputes each hash. Reports include a digest of their own content.</p>
          <p>Captured HTML is untrusted target content and is only ever served as plain text in a sandbox.</p>
        </Doc>
        <Doc id="safety" title="Target safety">
          <p>Only http and https targets inside the authorized domain are allowed. Every request is checked by the worker: private, loopback, link-local and cloud-metadata addresses are blocked after DNS resolution, redirects are re-validated, and non-GET page submissions and payment paths are blocked so no order or payment can be placed.</p>
        </Doc>
      </div>
    </Page>
  );
}
