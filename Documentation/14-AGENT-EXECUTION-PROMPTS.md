# MIRROR Agent Execution Prompts

## Task-by-task instructions for Kiro

Use these prompts as separate tasks. Do not paste all prompts into one
request.

## Prompt 1: Repository inspection and plan

Read `SYSTEM.md`, `KIROWEEN.md` and the supporting project documents.
Inspect the repository and the installed Kiro environment. Do not
implement the application yet.

Produce: 1. Architecture summary 2. Dependency map 3. Proposed monorepo
structure 4. Kiro specs and steering plan 5. Risk register 6. Exact
owner actions required 7. Phased implementation plan with acceptance
criteria

Do not invent Kiro configuration formats. Verify them against the
installed version's documentation.

## Prompt 2: Foundation

Implement the monorepo foundation, TypeScript configuration, pnpm
workspaces, Docker Compose, PostgreSQL, Redis, Prisma, API skeleton,
frontend skeleton and worker skeleton.

Create the Kiro steering files and initial specs. Add health checks and
environment validation.

Run install, typecheck, lint and build. Report exact results.

## Prompt 3: Demo store

Implement the first-party controlled demo store with the three variants
defined in `13-DEMO-STORE-AND-SCENARIO.md`.

Use stable test IDs and accessible labels. Ensure no payment transaction
can occur. Write browser tests proving each variant exposes the intended
state.

## Prompt 4: Browser worker

Implement isolated Playwright contexts, journey schema, job queue,
worker lifecycle, timeouts, cancellation, observation capture and
progress events.

Do not begin semantic analysis until browser execution and observation
persistence work.

## Prompt 5: Differential engine

Implement DOM, text, commercial, behavioural and visual comparison
modules. Preserve raw observations. Add deterministic and property-based
tests. Demonstrate discovery of the demo variants without hardcoded
findings.

## Prompt 6: Evidence system

Implement artifact storage, SHA-256 manifests, authorized retrieval,
JSON and PDF reports. Verify artifact hashes. Redact secrets before
logging or export.

## Prompt 7: AI investigation

Implement provider abstraction, structured outputs, evidence references,
prompt-injection protection and graceful provider failure. AI must not
become a dependency for deterministic findings.

## Prompt 8: Product interface

Implement all required screens using `04-DESIGN-SYSTEM.md`. Connect
every screen to real backend data. Do not leave inert controls or
fabricated metrics.

## Prompt 9: Security review

Review SSRF, redirects, DNS rebinding, browser isolation, secrets,
access controls, evidence downloads, prompt injection, data retention
and resource limits. Add adversarial tests.

## Prompt 10: Release

Run all tests. Build production artifacts. Deploy web, API, worker,
database, queue, demo store and evidence storage. Prepare README, setup
guide, public repository, licence, Kiro evidence and judge access.

Do not claim a release is ready until a clean end-to-end run has passed.

## Standard response format after each task

Report: - Files created or modified - Functionality implemented -
Commands executed - Test results - Known defects - Security concerns -
Owner actions required - Next recommended task

Do not report a command or test as successful unless it was actually
executed.
