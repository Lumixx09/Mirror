# MIRROR Evidence Management and AI Investigation

## 1. Evidence principles

Original observations are immutable. Derived analysis is stored
separately and references the original evidence.

Every artifact must have: - Artifact ID - Run ID - Session ID where
applicable - Observation ID where applicable - Capture timestamp -
Artifact type - Storage key - MIME type - Size - SHA-256 hash -
Redaction status - Retention metadata

## 2. Artifact types

-   Viewport screenshot
-   Full-page screenshot
-   Element screenshot
-   DOM snapshot
-   Structured observation JSON
-   Journey execution log
-   Selected network metadata
-   Difference overlay
-   JSON report
-   PDF report
-   Evidence manifest

## 3. Storage

Use a storage abstraction. Local filesystem for development;
S3-compatible object storage for deployment.

Do not put large binary objects in ordinary database rows.

Use signed or authenticated download access. Do not expose public object
paths containing sensitive evidence.

## 4. Integrity

Calculate SHA-256 over the exact stored artifact bytes.

Manifest example:

``` json
{
  "manifestVersion": 1,
  "runId": "run_123",
  "artifacts": [
    {
      "artifactId": "artifact_123",
      "path": "evidence/session-a/page.png",
      "sha256": "computed-hash",
      "size": 12345,
      "capturedAt": "2026-11-20T10:00:00Z"
    }
  ]
}
```

Verify hashes during integrity checks and exports.

A hash only demonstrates consistency with the manifest. It is not a
trusted timestamp or proof of legal admissibility.

## 5. Redaction

Redact: - Passwords - Authentication headers - Cookies - Access tokens -
Payment data - Sensitive form values - Unnecessary personal information

Apply redaction before logs, AI requests and report exports. Keep the
original only where explicitly necessary, authorized and protected.

## 6. AI provider abstraction

Define a provider interface independent of any one model vendor.

Inputs should include: - Finding records - Relevant normalized
observations - Selected evidence descriptions - Experiment
configuration - Explicit analysis question

Outputs must be schema-validated.

## 7. AI output schema

``` json
{
  "summary": "string",
  "observations": [
    {
      "statement": "string",
      "findingIds": ["finding_123"],
      "observationIds": ["obs_123"],
      "classification": "confirmed_observation"
    }
  ],
  "alternativeExplanations": ["string"],
  "recommendedExperiments": ["string"],
  "limitations": ["string"]
}
```

Do not accept unsupported factual claims. Validate that every referenced
ID exists in the current investigation.

## 8. Prompt injection protection

Captured website text is untrusted data.

-   Delimit it as evidence, not instructions.
-   Never allow page text to change system policy.
-   Do not expose tools that can perform arbitrary actions to the
    analysis model.
-   Do not allow AI to trigger transactions.
-   Keep AI read-only.
-   Limit input size.
-   Record provider, model and prompt version where appropriate.

## 9. AI failure

If the provider is unavailable: - Preserve deterministic findings. -
Show AI analysis as unavailable or pending. - Allow retry. - Do not mark
the experiment failed solely because optional AI analysis failed.

## 10. Reports

Reports must include: - Investigation metadata - Target and
authorization scope - Experiment and session configurations - Run
timestamps - Browser and environment metadata - Journey steps -
Observations - Findings and classifications - Evidence references and
hashes - AI explanation clearly labelled as generated interpretation -
Limitations and reproduction instructions
