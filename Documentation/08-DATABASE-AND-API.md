# MIRROR Database and API Specification

## 1. Database

Use PostgreSQL and Prisma. All schema changes require migrations. Use
UUID identifiers consistently.

Core entities: - User - Investigation - AuthorizationScope -
Experiment - ExperimentSession - Journey - JourneyStep - ExecutionRun -
BrowserObservation - DifferenceFinding - EvidenceArtifact - Report -
AuditEvent

## 2. Suggested fields

### User

`id`, `email`, `passwordHash` or external auth ID, `createdAt`,
`updatedAt`.

### Investigation

`id`, `userId`, `title`, `description`, `targetUrl`, `status`,
`authorizationScopeId`, `createdAt`, `updatedAt`.

### Experiment

`id`, `investigationId`, `name`, `configuration`,
`normalizationVersion`, `createdAt`.

### ExperimentSession

`id`, `experimentId`, `name`, `configuration`,
`configurationFingerprint`, `sessionRole`, `createdAt`.

### Journey

`id`, `experimentId`, `name`, `version`, `createdAt`.

### JourneyStep

`id`, `journeyId`, `sequence`, `type`, `configuration`, `createdAt`.

### ExecutionRun

`id`, `experimentId`, `status`, `startedAt`, `completedAt`, `error`,
`workerId`, `executionMetadata`.

### BrowserObservation

`id`, `executionRunId`, `sessionId`, `observationType`, `payload`,
`capturedAt`.

### DifferenceFinding

`id`, `experimentId`, `baselineObservationId`,
`comparisonObservationId`, `type`, `severity`, `confidence`,
`classification`, `description`, `evidenceReferences`, `createdAt`.

### EvidenceArtifact

`id`, `executionRunId`, `observationId`, `type`, `storageKey`, `sha256`,
`size`, `metadata`, `createdAt`.

### Report

`id`, `investigationId`, `experimentId`, `format`, `storageKey`,
`createdAt`.

### AuditEvent

`id`, `userId`, `investigationId`, `eventType`, `metadata`, `timestamp`.

Add indexes for common filters, foreign keys and unique constraints. Use
transactions where multiple records must change atomically.

## 3. API conventions

Prefix: `/api/v1`

Suggested endpoints:

``` text
GET    /health

GET    /investigations
POST   /investigations
GET    /investigations/:id
PATCH  /investigations/:id
DELETE /investigations/:id

POST   /investigations/:id/experiments
GET    /experiments/:id
POST   /experiments/:id/run
GET    /experiments/:id/runs
GET    /experiments/:id/findings

GET    /runs/:id
POST   /runs/:id/cancel
GET    /runs/:id/observations

GET    /findings/:id
GET    /findings/:id/evidence

GET    /evidence/:id
GET    /evidence/:id/download

POST   /reports
GET    /reports/:id

GET    /settings
PATCH  /settings
```

Use Zod or an equivalent schema library for request and response
validation. Generate OpenAPI documentation.

## 4. API response conventions

Use a consistent shape for success and error responses. Include
pagination metadata for lists. Never return stack traces, secrets or
internal infrastructure details.

## 5. Realtime events

Use authenticated WebSocket connections. Events include: -
`experiment:queued` - `experiment:started` - `session:started` -
`session:progress` - `observation:captured` - `session:completed` -
`session:failed` - `analysis:started` - `finding:created` -
`experiment:completed` - `experiment:failed`

On reconnect, the client must fetch current state rather than assume all
events were received.

## 6. Idempotency

Job retries and duplicate events must not create duplicate findings. Use
stable idempotency keys or unique constraints derived from run,
comparison pair, finding type and normalized evidence.

## 7. Authorization

Every read and write must verify ownership or role-based access.
Evidence download routes require authorization. Do not trust IDs
supplied by the browser.
