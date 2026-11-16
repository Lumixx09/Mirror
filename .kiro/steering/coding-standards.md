# MIRROR Steering: Coding Standards

## TypeScript & Code Quality
1. **Strict Typing:** `strict: true` across all tsconfig files. Avoid `any`; use typed generics or `unknown` with type narrowing.
2. **Schema-Driven Boundaries:** All API payloads, journey configurations, observations, and findings must be validated using Zod schemas from `packages/schemas`.
3. **Immutability:** Preserve raw observations. Normalization must return new data copies without modifying raw records.
4. **Error Handling:** Use typed domain errors. Do not leak stack traces or system environment variables to API responses.
5. **No Blind Sleeps:** In browser automation, rely on deterministic locators (`getByTestId`, accessible roles) and state-based waits (`waitForSelector`, `waitForResponse`), avoiding arbitrary `sleep` timeouts.
6. **Logging & Provenance:** Every log, observation, and finding must include run ID, session ID, and ISO timestamp.
