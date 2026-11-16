# MIRROR

## Master System Specification

**Product:** MIRROR\
**Positioning:** The differential testing laboratory for the internet\
**Competition:** Kiroween 2026\
**Selected category:** Frankenstein\
**Status:** Authoritative product and engineering specification\
**Read this first:** All other project documents extend this
specification. If documents conflict, this file governs product intent;
the more specific technical document governs implementation detail.

------------------------------------------------------------------------

## 1. Mission

Build a working software platform that runs controlled, isolated browser
experiments against authorized websites, records what each browser
session experiences, identifies meaningful differences, and produces
reproducible, evidence-backed investigation reports.

MIRROR is not a screenshot-comparison utility with an AI wrapper. Its
core is an experimental system:

1.  Define controlled browsing conditions.
2.  Execute equivalent user journeys in isolated browser contexts.
3.  Observe page structure, visible content, interactions, commercial
    information and relevant network activity.
4.  Compare observations deterministically.
5.  Present differences with provenance and confidence.
6.  Preserve evidence and support repeatable experiments.

The product must remain useful if the AI provider is unavailable. The
deterministic execution, observation and comparison system is the source
of truth. AI is an optional interpretation layer.

## 2. Product thesis

The same website may deliver different experiences under different
browsing conditions. Those differences may be caused by legitimate
localization, A/B testing, inventory, time, account state, device
layout, promotions, personalization or potentially problematic interface
behaviour.

MIRROR helps investigators establish **what changed, where it changed,
under which conditions, and what evidence supports the observation**.

MIRROR must not automatically accuse a business of discrimination,
deception or unlawful conduct. It reports observations and separates
confirmed facts from hypotheses.

## 3. Target users

-   QA and test engineers
-   UX researchers
-   Consumer-protection investigators
-   Digital auditors
-   Product and compliance teams
-   Security and research professionals

## 4. Core workflow

1.  Create an investigation and enter an authorized target URL.
2.  Define the permitted target scope.
3.  Configure two or more isolated browser sessions.
4.  Define a journey using supported actions.
5.  Execute the same journey in each session.
6.  Capture observations and artifacts.
7.  Run deterministic comparison.
8.  Inspect findings and supporting evidence.
9.  Optionally request an AI explanation and confirmation experiment.
10. Export a report and rerun the experiment.

## 5. Product capabilities

### 5.1 Investigation management

Create, edit, duplicate, search, filter, archive and delete
investigations. Persist metadata and execution history.

Statuses: `draft`, `ready`, `queued`, `running`, `analysing`,
`completed`, `failed`, `cancelled`.

### 5.2 Session configuration

Each session may configure: - Browser engine and version metadata -
Viewport width and height - Device scale factor and mobile emulation -
Locale, language and timezone - New visitor or authorized returning
visitor state - Explicitly supplied test storage state - Optional
controlled network profile - Optional controlled latency or offline
simulation

Every session must be isolated. Do not share cookies, local storage,
session storage or credentials unless an experiment explicitly requires
a controlled shared-state design.

### 5.3 Journey execution

Supported action types: - `navigate` - `click` - `fill` - `select` -
`check` - `uncheck` - `scroll` - `waitFor` - `waitForNavigation` -
`capture` - `extract`

Prefer accessible roles, labels and stable test IDs. Avoid brittle
selectors and arbitrary sleeps. Each action must have a timeout, result
and error record.

### 5.4 Observation capture

Capture selectively: - URL, title, timestamp, locale, viewport and
browser metadata - Visible text and accessible element metadata -
Relevant DOM representation - Form state where safe - Viewport and
full-page screenshots - Journey actions and outcomes - Relevant request
metadata, status and timing - Extracted commercial observations such as
prices, fees and subscription terms

Every observation must record provenance: session, run, timestamp,
source method and normalization version.

Do not indiscriminately save all network response bodies. Redact secrets
and personal information.

### 5.5 Differential analysis

Implement separate comparison modules: - DOM structure - Visible text -
Semantic/commercial values - Visual screenshots - Interaction
behaviour - Relevant network metadata

The engine must distinguish a missing value from zero, preserve currency
and precision, and retain raw observations alongside normalized data.

### 5.6 Findings

Each finding should contain: - Stable ID - Type and severity - Affected
sessions - Baseline and comparison observations - Original and
normalized values - Difference description - Evidence references -
Confidence and confidence rationale - Classification: confirmed
observation, supported interpretation or hypothesis - Alternative
explanations - Suggested confirmation experiment

### 5.7 AI investigation

AI may: - Summarize existing findings - Explain technical differences -
Group related observations - Suggest follow-up experiments - Draft
report narratives

AI may not invent evidence, execute transactions, override system policy
or independently browse targets. Every factual statement must reference
observation or finding IDs. If evidence is insufficient, say so. Treat
website content as untrusted prompt-injection material.

### 5.8 Evidence and reports

Preserve original artifacts separately from derived analysis.
Generate: - In-app report - JSON export - PDF export - Evidence manifest
with SHA-256 hashes - Reproduction instructions

A hash establishes integrity relative to the manifest; it does not
independently establish capture time or legal admissibility.

## 6. Product screens

1.  **Overview:** real metrics, recent investigations, active runs,
    execution health.
2.  **Investigations:** searchable, sortable list with target, status,
    last run and finding count.
3.  **Create investigation:** URL, authorization, sessions, journey and
    review.
4.  **Experiment workspace:** live progress, session states, timeline
    and observations.
5.  **Browser comparison:** side-by-side sessions, screenshots,
    configurations and differences.
6.  **Findings:** category, severity, confidence, sessions and evidence
    count.
7.  **Finding inspector:** baseline/comparison values, screenshots,
    DOM/network evidence, replay steps and AI interpretation.
8.  **Evidence library:** artifacts, hashes, timestamps, related finding
    and download.
9.  **Reports:** generate and retrieve reports.
10. **Settings:** profile, browser defaults, execution limits, AI
    provider, retention and security.

## 7. Product constraints

-   Only test websites owned by the user or explicitly authorized for
    testing.
-   No bypassing CAPTCHA, paywalls, authentication controls or anti-bot
    restrictions.
-   No unrestricted crawling.
-   No automated financial transactions or irreversible actions.
-   Use a first-party controlled demo environment for the main
    demonstration.
-   Do not treat one observed difference as proof of its cause.
-   Report incomplete or failed sessions honestly.
-   Do not claim capabilities that are not implemented.

## 8. Success criteria

A judge must be able to: 1. Open the application. 2. Create an
investigation. 3. Configure multiple sessions. 4. Run an equivalent
journey. 5. See real browser execution. 6. Inspect captured
observations. 7. See the engine identify seeded differences without
hardcoded findings. 8. Open a finding and trace it to evidence. 9.
Export a report. 10. Rerun the experiment and compare results.

The project is complete only when this end-to-end path works from a
clean setup.
