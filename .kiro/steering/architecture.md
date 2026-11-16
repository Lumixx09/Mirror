# MIRROR Steering: Technical Architecture & Service Boundaries

## Architecture Goals
- Clear separation between frontend (Web), control plane (API), background execution (Worker), and target (Demo Store).
- Monorepo structured with pnpm workspaces.
- Strict data contract sharing via `packages/contracts` and `packages/schemas`.
- Persistent state in PostgreSQL managed by Prisma ORM.
- Bounded concurrency queue in Redis managed by BullMQ.
- Immutable artifact storage with SHA-256 integrity manifests.

## Service Responsibilities
- `apps/web`: React 19 + TypeScript + Vite + Tailwind CSS. Renders views, controls experiments, and displays evidence. Must never launch browsers directly.
- `apps/api`: Node.js + Express + TypeScript. Enforces authentication, authorization, SSRF validation, and provides REST (`/api/v1`) & WebSocket event streaming.
- `apps/worker`: Playwright execution runner. Consumes queued experiment runs, executes journeys across isolated browser contexts, captures observations, and invokes differential analysis.
- `apps/demo-store`: Controlled first-party target demonstrating baseline, extra fee, and preselected subscription variants.
- `packages/differential-engine`: Functional comparator modules (DOM, text, commercial values, visual overlays). Deterministic, zero-side-effect, and property-tested.
- `packages/evidence-core`: Manages artifact storage, SHA-256 manifest generation, verification, and PDF/JSON reporting.
- `packages/ai-analysis`: Read-only, guardrailed LLM integration with structured JSON schema outputs referencing verified observation IDs.
