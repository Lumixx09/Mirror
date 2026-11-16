# MIRROR Product Requirements

## User Stories and Acceptance Criteria

## 1. Investigation lifecycle

### Create investigation

As an investigator, I can create an investigation with a title,
description, target URL and authorized scope.

Acceptance: - Invalid URLs are rejected. - Unsupported schemes are
rejected. - Authorization acknowledgement is recorded. - Investigation
persists after restart. - Draft can be edited before execution.

### Manage investigations

As an investigator, I can search, filter, duplicate, archive and delete
my investigations.

Acceptance: - Lists are paginated. - Filters are applied server-side. -
Access is limited to the authorized owner or role. - Deletion behaviour
is documented and auditable.

## 2. Sessions

As an investigator, I can create at least two isolated browser sessions
with different configurations.

Acceptance: - Each session has a unique ID. - Cookies and storage are
isolated by default. - Locale, timezone and viewport are configurable. -
Session configuration is persisted and fingerprinted. - Secrets are not
exposed in API responses or logs.

## 3. Journeys

As an investigator, I can define a sequence of browser actions and reuse
it across sessions.

Acceptance: - Supported steps are schema-validated. - Each step has a
result, duration and error state. - Timeouts are configurable within
safe limits. - Failed steps are preserved in the run record. - No
irreversible or financial action is executed by default.

## 4. Execution

As an investigator, I can start, monitor and cancel an experiment.

Acceptance: - A job is queued and assigned to a worker. - Browser
sessions execute in isolated contexts. - Live progress is available. -
Concurrency and timeouts are bounded. - Worker crashes do not corrupt
completed observations. - Failed sessions are not presented as
successful.

## 5. Observations

As an investigator, I can inspect the evidence captured during each
session.

Acceptance: - Every observation identifies run, session and timestamp. -
Raw observations are preserved separately from normalized data. -
Screenshots and metadata are accessible to authorized users. - Sensitive
values are redacted. - Large artifacts are size-limited.

## 6. Differential findings

As an investigator, I can see meaningful differences between sessions.

Acceptance: - DOM, text and configured semantic comparisons work. -
Price extraction preserves currency and precision. - Missing values are
distinct from zero. - Findings cite observation IDs. - Repeated
identical inputs yield deterministic results. - Visual difference is not
treated as proof of behavioural difference. - Findings distinguish
observation from hypothesis.

## 7. AI explanation

As an investigator, I can request a plain-language explanation of
existing findings.

Acceptance: - AI input contains only necessary evidence. - Output
follows a validated schema. - Every factual assertion references finding
or observation IDs. - Unsupported conclusions are labelled uncertain. -
AI outage does not disable deterministic comparison. - Captured page
content is treated as untrusted input.

## 8. Evidence and reports

As an investigator, I can export an investigation report and verify
artifact integrity.

Acceptance: - JSON report is generated. - PDF report is generated. -
Manifest contains artifact hashes. - Report links findings to
evidence. - Export operations are auditable. - Hashes are verified
against the stored manifest.

## 9. Reproducibility

As an investigator, I can rerun an experiment using its saved
configuration.

Acceptance: - Configuration and journey versions are preserved. - New
run receives a new execution ID. - Old runs remain immutable. - Results
can be compared across runs. - Environmental differences are recorded.

## 10. User experience

Acceptance: - All primary navigation works. - Every control performs its
stated action. - Loading, empty, error and success states exist. -
Dashboard metrics use persisted backend data. - No fabricated activity
or hardcoded result is presented as live data. - Keyboard navigation and
accessible labels are supported.
