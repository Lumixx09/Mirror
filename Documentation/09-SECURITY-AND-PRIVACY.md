# MIRROR Security and Privacy Requirements

## 1. Threat model

MIRROR visits user-supplied websites using browser automation. A
malicious target could attempt to: - Access internal network services -
Reach cloud metadata endpoints - Exploit redirects or DNS rebinding -
Exfiltrate browser state - Inject instructions into AI analysis -
Consume excessive CPU, memory or storage - Cause sensitive information
to be captured

Treat every target website as untrusted.

## 2. SSRF protection

Enforce protections in API, worker and network infrastructure.

Block: - localhost and loopback - Private IPv4 and IPv6 ranges -
Link-local addresses - Cloud metadata endpoints - Internal service
hostnames - Disallowed schemes - Redirects to prohibited destinations

Resolve DNS and validate addresses before navigation. Revalidate
redirects and mitigate DNS rebinding. Use network egress restrictions so
application-level validation is not the only defence.

## 3. Authorization

Only test websites owned by the user or covered by explicit
authorization.

Require: - Authorization acknowledgement - Permitted domain or scope -
Purpose - Optional expiry or authorization reference

Do not bypass CAPTCHA, paywalls, authentication restrictions or anti-bot
protections. Do not perform financial transactions or irreversible
actions.

## 4. Browser isolation

Run browser workers in dedicated containers or isolated compute. Use
least privilege. Do not mount sensitive host directories. Limit CPU,
memory, process count, job duration and artifact size.

## 5. Secrets

-   Use environment variables or a secret manager.
-   Never commit `.env`.
-   Never log tokens, passwords or cookies.
-   Encrypt persisted sensitive session state.
-   Restrict access to secrets by service.
-   Rotate compromised credentials.

## 6. Privacy

Capture only what is necessary. Redact passwords, payment information,
authentication headers, cookies and unnecessary personal data. Provide
configurable retention and deletion. Ensure reports and AI requests use
redacted evidence.

## 7. AI security

Treat page content as untrusted evidence, not instructions. The AI
analysis layer is read-only. It must not have arbitrary browser, shell,
filesystem or transaction tools. Validate model outputs and evidence
references.

## 8. Web application security

Implement: - Authentication - Authorization checks - CSRF protection
where relevant - Secure cookies - Input validation - Output encoding -
Rate limiting - CORS allowlist - Security headers - Dependency
scanning - Audit logging - Safe file downloads

## 9. Incident response

Document how to: - Disable browser workers - Revoke provider
credentials - Rotate secrets - Quarantine evidence - Inspect audit
logs - Restore service - Notify affected users where required

## 10. Security acceptance tests

Test malformed URLs, redirects to private IPs, IPv6 loopback, metadata
endpoints, DNS rebinding scenarios, malicious page instructions,
oversized snapshots, secret redaction, unauthorized evidence access and
worker resource exhaustion.
