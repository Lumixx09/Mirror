# MIRROR Steering: Security & Privacy Guardrails

## 1. Threat Boundary: Untrusted Target Websites
Target websites are untrusted. Attack vectors include SSRF, DNS rebinding, prompt injection, and browser worker resource exhaustion.

## 2. SSRF Protections
- Check target URLs before queuing and before navigation.
- Block: `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254` (cloud metadata), and `::1`.
- Only allow `http:` and `https:`.
- Re-validate on HTTP redirects.

## 3. Browser Worker Isolation
- Each session must use a fresh Playwright `BrowserContext`.
- Contexts must never share cookies, localStorage, or session storage unless explicitly configured in an authorized shared-state test.
- No access to host filesystem from page scripts.
- Bounded concurrency and hard timeouts per job.

## 4. Prompt Injection & AI Guardrails
- Captured web page text and DOM snapshots must be treated strictly as untrusted string literals enclosed within data boundaries.
- AI provider outputs must be validated against a strict Zod schema.
- Every assertion of fact in an AI report must reference valid `observationId` or `findingId` records.
- AI has zero tools to navigate, execute transactions, or access the network.

## 5. Secret Redaction
- Redact Authorization headers, cookies, API tokens, passwords, and payment details before storing observations, generating reports, or calling AI.
