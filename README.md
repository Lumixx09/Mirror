# MIRROR

**The Differential Testing Laboratory for the Internet**

MIRROR is an isolated, reproducible browser experimentation platform designed to detect, analyze, and explain differences in the experiences websites deliver under different browsing conditions (such as geolocation, viewport, headers, or account state).

---

## 1. What MIRROR Does

* **Isolated Browser Execution**: Spins up independent, isolated Playwright contexts with zero shared cookies, storage, or cache.
* **Deterministic Journey Replay**: Executes identical user journeys across baseline and comparison sessions using robust, accessible selectors.
* **Multi-Layer Observation**: Selectively records DOM structures, visible text, network metadata, and commercial line items.
* **Differential Analysis Engine**: Identifies price modifications, surprise checkout surcharges, preselected recurring subscriptions, structural shifts, and visual differences.
* **Evidence Integrity**: Automatically calculates SHA-256 digests for all captured DOM snapshots, screenshots, and logs, preserving them in verifiable manifests.
* **Optional AI Investigation**: Provides an optional, read-only AI interpretation layer with strict schema validation and evidence citation (never making unsupported claims or navigating unassisted).

---

## 2. Monorepo Architecture

```text
mirror/
├── apps/
│   ├── web/              # React 19 + Vite + Tailwind CSS forensic dashboard
│   ├── api/              # Node.js + Express control plane with WebSocket streaming
│   ├── worker/           # Playwright worker pool for isolated browser journeys
│   └── demo-store/       # Controlled first-party target with seeded variants A, B, and C
├── packages/
│   ├── contracts/        # Shared TypeScript interfaces and DTOs
│   ├── schemas/          # Zod validation schemas
│   ├── shared/           # SSRF filtering, crypto hashing, and secret redaction
│   ├── differential-engine/ # Deterministic comparators and commercial parsers
│   ├── evidence-core/    # Storage drivers and SHA-256 evidence manifests
│   ├── observation-engine/ # Sanitized DOM and network capture
│   ├── experiment-runner/ # Journey action sequence runners
│   └── ai-analysis/      # Read-only guardrailed AI integration
├── prisma/
│   └── schema.prisma     # Relational persistence models
├── docker-compose.yml    # PostgreSQL and Redis services
└── .kiro/                # Kiro steering guidelines and specialist agent definitions
```

---

## 3. Prerequisites

* **Node.js**: `v20.x` or `v24.x` (LTS)
* **pnpm**: `v9.x` or `v10.x` (or `npm`)
* **Docker Desktop** (optional for local PostgreSQL and Redis containers)
* **Git**

---

## 4. Setup & Quickstart

### 1. Clone & Configure
```bash
git clone https://github.com/Lumixx09/Mirror.git
cd Mirror
cp .env.example .env
```

### 2. Provide PostgreSQL & Redis
Either run them locally with Docker:
```bash
docker compose up -d
```
or use hosted free tiers (no Docker needed) and set `DATABASE_URL` / `REDIS_URL` in `.env`:
* **Supabase Postgres**: use the *Session pooler* connection string (IPv4). The direct `db.<ref>.supabase.co` host is IPv6-only.
* **Upstash Redis**: use the `rediss://` TCP URL. The worker polls conservatively to stay within the free command quota.

### 3. Install Dependencies & Browser
```bash
pnpm install              # also generates the Prisma client
pnpm browsers:install     # Chromium matching the installed Playwright version
```

### 4. Database Setup
```bash
pnpm db:migrate           # applies prisma/migrations
```

### 5. Start Development
```bash
pnpm dev                  # builds packages, then runs web, api, worker and demo store
```
Then open the web workstation, click **New investigation → Load demo scenario → Create and run experiment**.

### 6. Quality checks
```bash
pnpm typecheck
pnpm test                 # unit + property-based tests (vitest, fast-check)
pnpm build
```
* **Web Workstation**: [http://localhost:5173](http://localhost:5173)
* **API Control Plane**: [http://localhost:4000](http://localhost:4000)
* **Demo Target Store**: [http://localhost:4001/product](http://localhost:4001/product)

---

## 5. Controlled Showcase Scenario

MIRROR ships with an integrated first-party test store (`apps/demo-store`) featuring three deterministic variants:
1. **Variant A (Baseline)**: $49.00 Hardware Key, clean checkout, no extra fee.
2. **Variant B (Surcharge)**: $49.00 Hardware Key + $8.00 compliance surcharge revealed at checkout.
3. **Variant C (Subscription)**: $49.00 Hardware Key + $19.99/mo preselected recurring key replacement toggle.

Running an experiment against this target allows you to observe the differential engine identify both the hidden surcharge and the preselected subscription default with zero hardcoded findings.

---

## 6. Security & Privacy

* **Strict SSRF Defense**: Enforces address checking against loopback (`127.0.0.1`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata services (`169.254.169.254`).
* **Zero Host Access**: Page scripts inside automated sessions cannot access host files or credentials.
* **Secret Redaction**: Cookies, authorization headers, and payment inputs are redacted before artifact logging and analysis.
* **Untrusted Page Content**: Web DOM text is treated strictly as untrusted data literals to prevent prompt injection.

---

## 7. Kiro AI Assisted Development

This repository was structured and guided using Kiro:
* **Steering Rules (`.kiro/steering/`)**: Persistent product boundaries, architecture rules, design tokens, security policies, and testing standards.
* **Specialist Agent Roles (`.kiro/agents/`)**: Architect, Browser Engineer, Differential Analyst, Evidence Engineer, and Adversarial QA.

---

## 8. Competition

* **Event**: Kiroween 2026 ([https://kiroween.devpost.com/](https://kiroween.devpost.com/))
* **Category**: Frankenstein

---

## 9. License

MIT License. See [LICENSE](LICENSE) for details.
