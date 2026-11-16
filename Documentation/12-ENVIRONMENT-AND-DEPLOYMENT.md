# MIRROR Environment Setup and Deployment

## 1. Prerequisites

-   Node.js LTS (pin exact supported version)
-   pnpm (pin version)
-   Docker Desktop or Docker Engine
-   Git
-   Kiro IDE
-   A terminal

Cloud accounts are not required for local development.

## 2. Local services

Use Docker Compose for: - PostgreSQL - Redis - Optional local object
storage compatible with S3

Run the web app, API, worker and demo store as development processes or
containers.

## 3. Environment variables

Create `.env.example` with documented placeholders:

``` env
NODE_ENV=development
WEB_URL=http://localhost:5173
API_URL=http://localhost:4000
API_PORT=4000

DATABASE_URL=
REDIS_URL=

AUTH_SECRET=

STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage

AI_PROVIDER=
AI_API_KEY=
AI_MODEL=

BROWSER_HEADLESS=true
BROWSER_MAX_CONCURRENCY=2
BROWSER_TIMEOUT_MS=60000

MAX_SCREENSHOT_SIZE_MB=15
MAX_DOM_SNAPSHOT_SIZE_MB=10
EVIDENCE_RETENTION_DAYS=30

ALLOWED_TEST_DOMAINS=localhost,127.0.0.1
```

Adjust to the implemented services. `.env` must be ignored by Git. Never
commit real values.

## 4. Local setup commands

The agent must implement and verify these scripts before documenting
them as supported:

``` bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Quality commands:

``` bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Provide a root package script for each command. Do not leave commands as
aspirational placeholders.

## 5. Local acceptance

A clean machine should be able to: 1. Clone the repository. 2. Copy
`.env.example` to `.env`. 3. Start Docker services. 4. Install
dependencies. 5. Run migrations and seed. 6. Start all services. 7. Open
the frontend. 8. Run the controlled demo experiment.

## 6. Production topology

Recommended: - Frontend: static hosting or managed web platform. - API:
persistent Node service. - Worker: dedicated container or VM with
Playwright browser dependencies. - Database: managed PostgreSQL. -
Queue: managed Redis. - Evidence: S3-compatible object storage.

Do not host long-running browser workers in ordinary serverless
functions.

## 7. Deployment checklist

-   [ ] Production environment variables configured
-   [ ] Database migrated
-   [ ] Redis reachable
-   [ ] Object storage configured
-   [ ] Worker browser dependencies installed
-   [ ] Egress restrictions enabled
-   [ ] HTTPS enabled
-   [ ] CORS allowlist configured
-   [ ] Authentication enabled
-   [ ] Health checks working
-   [ ] Logs redact secrets
-   [ ] Demo store reachable
-   [ ] Judge access tested
-   [ ] Evidence export tested
-   [ ] Backup and retention configured

## 8. Deployment handover

Document provider names, service URLs, deployment commands, environment
variable names and operational limits. Do not put secret values in
documentation.
