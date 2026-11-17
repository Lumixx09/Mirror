# MIRROR Implementation Status

Last updated: 2026-11-17
Current phase: Product interface (phases 1–6 and 8 functional; 7, 9, 10 outstanding)
Overall status: End-to-end demo verified locally against hosted Postgres (Supabase) and Redis (Upstash)

## 1. Phase tracker

| Phase                  | Status      | Evidence |
| ---------------------- | ----------- | -------- |
| Foundation             | Passed      | `pnpm install`, `pnpm typecheck`, `pnpm build` succeed; Prisma migration `init` applied |
| Demo store             | Passed      | Variants A/B/C served deterministically; exercised by every end-to-end run |
| Browser execution      | Passed      | Isolated contexts per session, versioned journey runner, cancellation between steps, network guard |
| Observation engine     | Passed      | Generic extraction (row labels, JSON-LD, form defaults); no demo-specific code |
| Differential engine    | Passed      | Commercial, default-selection, navigation, text, journey comparators; property tests |
| Evidence system        | Passed      | SHA-256 per artifact, immutable storage, run manifest, verify endpoint, JSON + PDF reports |
| AI investigation       | Not started | Schema and prompt guard exist in `packages/ai-analysis`; no provider wired |
| Product interface      | Passed      | Landing, auth, overview, investigations, experiments, creation wizard, run workspace (live lanes, comparison workstation with overlay/pixel-diff/DOM modes and highlights), findings, finding inspector, evidence library, reports + preview, settings, docs |
| Security hardening     | In progress | SSRF/DNS/redirect checks, scope enforcement, non-GET submission block, authentication and session management |
| Deployment and release | Not started | |

## 2. Requirements

| Requirement                       | Status      | Test or evidence |
| --------------------------------- | ----------- | ---------------- |
| Multiple isolated sessions        | Passed      | 3 sessions per demo run, separate BrowserContexts |
| Equivalent journey replay         | Passed      | Same persisted journey replayed per session; step results recorded |
| Observation persistence           | Passed      | `BrowserObservation` rows + observation JSON artifacts |
| Price and fee extraction          | Passed      | Fee (+8.00) found and linked to total delta, unit + live run |
| Subscription comparison           | Passed      | Preselected checkbox and recurring line detected, unit + live run |
| Evidence provenance               | Passed      | 30/30 artifacts re-verified via `/runs/:id/verify` |
| Report export                     | Passed      | `report.json` (with content digest) and `report.pdf` |
| Experiment rerun                  | Passed      | Rerun from saved configuration via UI and `POST /experiments/:id/run` |
| Authorization and SSRF protection | Passed      | Unit tests for scheme, scope, private ranges, DNS rebinding; worker re-validates; user auth with per-user scoping |

## 3. Latest verification (commands actually run)

- Install: `pnpm install` — passed
- Typecheck: `pnpm typecheck` — passed (all 13 workspaces)
- Unit + property tests: `pnpm test` — 71 passed, 4 files
- Production build: web (Vite), api, worker, demo-store — passed
- Integration (live): demo investigation via API → run completed in ~25–30 s, 6 findings, 30 artifacts verified
- E2E (UI): headless browser drove wizard → run → findings → side-by-side → evidence verification; 0 console errors (script kept outside the repo; not yet a committed test)
- Lint: not configured

## 4. Known defects / gaps

| ID  | Severity | Description |
| --- | -------- | ----------- |
| D1  | Resolved | Authentication added: scrypt passwords, hashed server-side sessions in HTTP-only cookies, CSRF header check, login throttling, per-user data scoping, authenticated WebSocket. |
| D2  | Medium   | Visual (pixel) and network comparators not implemented. |
| D3  | Medium   | UI E2E test is not committed to the repo / CI. |
| D4  | Low      | Only the local storage driver exists (no S3-compatible driver). |
| D5  | Low      | No evidence-retention cleanup job yet. |

## 5. Owner actions required

- [ ] Kiro account verified, credits requested/redeemed
- [ ] Record genuine Kiro usage (`.kiro/specs`, hooks) for the submission
- [ ] AI provider selected (optional)
- [ ] Deployment provider selected (worker needs a container/VM with Chromium)
- [ ] Judge access tested

## 6. Release readiness

- [ ] Public repository · [ ] Licence file · [x] Root `.kiro` · [ ] README updated for hosted DBs · [ ] Working public demo · [x] Local end-to-end demonstration passed · [ ] No secrets in Git history (verify before publishing) · [ ] Video
