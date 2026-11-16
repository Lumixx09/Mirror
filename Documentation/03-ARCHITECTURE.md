# MIRROR Technical Architecture

## 1. Architecture goals

-   Clear separation of frontend, API, browser execution and analysis.
-   Deterministic core logic.
-   Independently scalable workers.
-   Reproducible runs.
-   Secure evidence storage.
-   Provider-independent AI layer.
-   Beginner-manageable local setup.

## 2. Recommended stack

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Frontend                            React, TypeScript, Vite

  Styling                             Tailwind CSS

  Routing                             React Router

  Server state                        TanStack Query

  Client state                        Zustand only where justified

  API                                 Node.js, Express, TypeScript

  Browser automation                  Playwright

  Queue                               Redis + BullMQ

  Database                            PostgreSQL

  ORM                                 Prisma

  Validation                          Zod

  Realtime                            WebSockets

  Tests                               Vitest, Playwright Test, fast-check

  Artifact storage                    Local filesystem in development;
                                      S3-compatible storage in production

  PDF                                 A maintained server-side PDF
                                      library

  Monorepo                            pnpm workspaces
  -----------------------------------------------------------------------

Pin supported versions and document them. Do not upgrade dependencies
casually during feature development.

## 3. Monorepo structure

``` text
mirror/
  apps/
    web/
    api/
    worker/
    demo-store/
  packages/
    contracts/
    schemas/
    shared/
    experiment-runner/
    observation-engine/
    differential-engine/
    evidence-core/
    ai-analysis/
  prisma/
    schema.prisma
    migrations/
  tests/
    unit/
    integration/
    e2e/
    security/
    fixtures/
  .kiro/
    specs/
    steering/
    hooks/
    agents/
  docs/
  docker/
  scripts/
  SYSTEM.md
  KIROWEEN.md
  README.md
  LICENSE
  .env.example
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

Adjust only with documented justification.

## 4. Service responsibilities

### Web

Renders investigations, experiment setup, live execution, comparisons,
findings, evidence and reports. It must not launch browsers directly.

### API

Authenticates users, validates input, manages investigations and
experiments, enqueues jobs, returns results, manages access and
coordinates report generation.

### Worker

Consumes jobs, launches isolated Playwright contexts, executes journeys,
captures observations and artifacts, invokes deterministic analysis and
updates run state.

### Demo store

A first-party controlled website with seeded, deterministic variants. It
must be independent of the comparison engine.

### Packages

Shared types and schemas must be reused by API, worker and frontend
where appropriate. The differential engine must be deterministic and
independently testable.

## 5. Execution data flow

1.  User submits experiment.
2.  API validates request and authorization scope.
3.  API persists experiment and run.
4.  API enqueues run ID.
5.  Worker claims job.
6.  Worker validates target again.
7.  Worker creates isolated contexts.
8.  Each context executes the versioned journey.
9.  Worker stores raw observations and artifacts.
10. Differential engine normalizes and compares observations.
11. Findings are persisted with evidence references.
12. Optional AI explanation is generated.
13. Run status becomes completed, partial or failed.
14. Web receives progress and final state.

Use idempotency for job processing and event handling. A retry must not
duplicate findings or corrupt the run.

## 6. Queue design

Use BullMQ with Redis.

Job payloads should contain IDs and minimal execution metadata, not
credentials or large artifacts.

Implement: - Bounded concurrency - Job timeout - Retry only for
transient infrastructure failures - Exponential backoff where
appropriate - Dead-letter or failed-job inspection - Graceful worker
shutdown - Heartbeats or health checks - Cancellation checks between
journey steps

Do not retry deterministic selector failures indefinitely.

## 7. Database and storage

PostgreSQL stores structured metadata, configurations, observations and
finding records.

Object storage stores screenshots, large DOM snapshots, report files and
other binary artifacts.

Use a storage interface: - `put` - `get` - `delete` - `head` -
`createDownloadUrl` where supported

Local development should work without a cloud account.

## 8. Realtime

WebSocket events: - `experiment:queued` - `experiment:started` -
`session:started` - `session:progress` - `observation:captured` -
`session:completed` - `session:failed` - `analysis:started` -
`finding:created` - `experiment:completed` - `experiment:failed`

Events must include run ID, experiment ID, event timestamp and relevant
session ID. The frontend must recover by fetching current state after
reconnecting.

## 9. Failure handling

Distinguish: - Validation failure - Authorization failure - Target
blocked - DNS/network failure - Browser launch failure - Journey step
failure - Partial observation - Analysis failure - AI provider failure -
Storage failure

A failure in optional AI analysis must not invalidate valid
deterministic findings. A failure in one session must not silently
disappear from the report.

## 10. Deployment topology

Deploy the web app and API separately if needed. Run browser workers in
a container or VM with browser dependencies and strict network controls.
Do not run long-lived browser automation inside ordinary serverless
functions.

Use managed PostgreSQL and Redis for production where available. Use
object storage for evidence. Provide health checks and logs without
secrets.
