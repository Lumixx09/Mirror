# MIRROR Testing and Quality Assurance Plan

## 1. Quality principle

A feature is not complete because code was generated or the page
renders. It is complete when its acceptance criteria are verified by
repeatable tests.

## 2. Test layers

### Unit tests

-   URL and session validation
-   Journey schema validation
-   Normalization
-   Price and currency extraction
-   DOM comparison
-   Text comparison
-   Visual diff calculations
-   Finding classification
-   Confidence calculation
-   Hash generation
-   Manifest verification

### Integration tests

-   Investigation persistence
-   Experiment creation
-   Queue processing
-   Worker execution
-   Observation persistence
-   Finding generation
-   Artifact storage
-   Report generation
-   Authorization checks

### End-to-end tests

Run a complete experiment against the controlled demo store: 1. Create
investigation. 2. Configure three sessions. 3. Execute same journey. 4.
Capture observations. 5. Detect the additional fee. 6. Detect the
subscription default. 7. Inspect linked evidence. 8. Generate JSON and
PDF reports. 9. Rerun experiment. 10. Verify history remains intact.

### Security tests

-   SSRF attempts
-   Redirect validation
-   Secret redaction
-   Unauthorized evidence access
-   Malicious page content
-   Oversized uploads and snapshots
-   Rate limiting
-   Worker resource limits

## 3. Property-based testing

Use fast-check or a suitable equivalent.

Required properties: - Equivalent normalized structures produce no
semantic finding. - Irrelevant attribute order does not change
results. - Price changes remain detectable. - Missing values are not
coerced to zero. - Currency mismatches are handled explicitly. - Same
input produces deterministic output. - Hash verification detects byte
changes. - Failed sessions are never represented as successful.

## 4. Test data

Use deterministic fixtures. Clearly separate fixtures from production
observations. Do not use seeded findings as if they were discovered by
the engine.

## 5. CI

Configure a CI pipeline to run: - Install with lockfile - Format check -
Lint - Typecheck - Unit tests - Relevant integration tests - Production
build

Run full browser E2E tests in an environment with browser dependencies.

## 6. QA status report

Maintain `IMPLEMENTATION_STATUS.md` with: - Completed requirements -
In-progress requirements - Failed tests - Known defects - Security
issues - Deployment status - Owner actions required

Never report a passing test unless it was actually executed and passed.
