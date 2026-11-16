# MIRROR Browser Execution Specification

## 1. Objective

Implement a reliable, isolated Playwright execution system that runs
equivalent journeys under controlled browsing conditions and records
reproducible observations.

## 2. Isolation model

Create a separate Playwright BrowserContext for each independent
session. Do not share cookies or storage by default.

Each session configuration must include: - Session ID - Browser engine -
Viewport - Device scale factor - Locale - Timezone - User agent metadata
where configurable - Storage state reference, if explicitly authorized -
Network profile - Configuration fingerprint

Do not store raw passwords in session configuration.

## 3. Execution lifecycle

`queued -> starting -> running -> capturing -> completed`

Failure states: - `failed` - `cancelled` - `timed_out` - `blocked` -
`partial`

Persist every transition with timestamp and reason.

## 4. Journey schema

Use a versioned, validated schema. Example:

``` json
{
  "version": 1,
  "name": "Product checkout journey",
  "steps": [
    {"type": "navigate", "url": "https://demo.example.test/product"},
    {"type": "click", "role": "button", "name": "Add to cart"},
    {"type": "waitFor", "testId": "cart-total"},
    {"type": "click", "testId": "checkout"},
    {"type": "capture", "name": "checkout"}
  ]
}
```

The example is illustrative. Implement validation and supported action
handlers.

## 5. Selector priority

1.  `getByTestId`
2.  Accessible role and name
3.  Label
4.  Placeholder
5.  Explicit CSS selector as a last resort

Do not use XPath as the default.

## 6. Timeouts and retries

-   Set per-step and overall timeouts.
-   Use explicit wait conditions.
-   Retry only transient failures.
-   Do not repeatedly retry missing selectors.
-   Preserve screenshots and logs on failure.
-   Record the exact failed step.

## 7. Observation points

Capture: - Before journey - After important navigation - After important
interaction - At explicitly configured capture steps - At journey
completion - On failure where safe

Avoid capturing excessive redundant screenshots.

## 8. Network observation

Record request URL, method, resource type, status, relevant headers and
timing. Redact authorization headers, cookies, tokens and sensitive
query values.

Do not store all response bodies. Use explicit allowlists for any
response-body inspection.

## 9. Security boundary

The worker is an untrusted-target execution environment.

Implement: - URL scheme allowlist (HTTP/HTTPS only) - DNS resolution
checks - Private, loopback, link-local and metadata IP blocking -
Redirect revalidation - DNS rebinding mitigation - Egress firewall or
network policy - Per-job resource limits - No host filesystem access
from page scripts - No privileged browser flags that weaken isolation

The API's validation is not sufficient. The worker and network layer
must independently enforce restrictions.

## 10. Target authorization

Require user confirmation and a defined authorized scope. Support domain
allowlists. Do not bypass CAPTCHA, paywalls, anti-bot systems or
authentication controls. If access is blocked, report it.

## 11. Concurrency

Use a bounded worker pool. Start with a conservative local concurrency,
configurable through environment settings. Respect memory and CPU
limits. Record worker identity and browser version.

## 12. Completion criteria

-   Two or more isolated sessions run the same journey.
-   Session configuration is persisted.
-   Progress is reported.
-   Observations are saved.
-   Failures are explicit.
-   Cancellation works.
-   Runs can be repeated from saved configuration.
-   Worker restart does not corrupt completed data.
