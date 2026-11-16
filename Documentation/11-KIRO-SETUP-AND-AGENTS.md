# MIRROR Kiro Setup and Agent Operating Guide

## 1. Purpose

Use Kiro as the primary AI-assisted engineering environment. This guide
defines how to establish project context, specifications, steering,
hooks and specialist agents.

Use current Kiro documentation and supported configuration formats. Do
not invent configuration keys or assume every feature is available in
every Kiro version or account.

Documentation: - https://kiro.dev/docs/ -
https://kiro.dev/docs/getting-started/

## 2. Initial setup

1.  Install Kiro from its official source.
2.  Sign in to the correct account.
3.  Create or open the `mirror` project directory.
4.  Add `SYSTEM.md` and `KIROWEEN.md`.
5.  Initialize Git.
6.  Install the supported Node.js LTS version.
7.  Install pnpm.
8.  Install Docker.
9.  Verify the local environment.
10. Open the repository in Kiro.

## 3. Suggested `.kiro` structure

``` text
.kiro/
  specs/
    product-foundation/
      requirements.md
      design.md
      tasks.md
    browser-execution/
    observation-engine/
    differential-analysis/
    evidence-management/
    ai-investigation/
    application-interface/
    security-and-authorization/
    deployment-and-release/
  steering/
    product.md
    architecture.md
    coding-standards.md
    design-system.md
    security.md
    testing.md
    competition.md
  hooks/
  agents/
```

Use the actual file formats and locations supported by the installed
Kiro release. Keep `.kiro` at the repository root and commit it.

## 4. Steering documents

`product.md`: product thesis, scope and user workflow.

`architecture.md`: service boundaries, data flow and technology
decisions.

`coding-standards.md`: TypeScript standards, naming, error handling and
testing.

`design-system.md`: tokens, components and accessibility.

`security.md`: authorization, SSRF, secrets, privacy and AI boundaries.

`testing.md`: test levels, acceptance criteria and quality gates.

`competition.md`: category, repository and submission requirements.

Keep steering files concise and non-duplicative.

## 5. Specs

Create one spec per major system capability. Each spec should include: -
User and system requirements - Acceptance criteria - Technical design -
Data contracts - Dependencies - Implementation tasks - Test strategy -
Known limitations

Do not create one enormous spec for the entire application.

## 6. Specialist agents

### Architect

Owns architectural consistency, module boundaries and dependency review.

### Browser Engineer

Owns Playwright execution, isolation, journey replay and worker
reliability.

### Differential Analyst

Owns normalization, extraction, comparisons, confidence and
false-positive control.

### Evidence Engineer

Owns artifact storage, integrity, manifests and report generation.

### Adversarial QA

Challenges assumptions, tests failure cases and reviews security.

Use agent delegation only where the work is separable. Avoid duplicate
work and conflicting edits.

## 7. Hooks

Useful automation: - Format and lint changed files. - Run targeted unit
tests. - Validate schemas. - Run comparison-engine tests after
comparison changes. - Validate Prisma schema after database changes. -
Run build and E2E tests before release.

Configure hooks using the installed Kiro version's documented format.
Execute each hook and verify it works. Do not claim a hook is
operational until tested.

## 8. MCP and Powers

Evaluate only integrations that provide real value: - Browser tooling -
Documentation retrieval - GitHub workflow - Database inspection

Obtain owner approval for credentials or external access. Do not install
unnecessary integrations to inflate the Kiro feature list.

## 9. Daily workflow

For each task: 1. Read the relevant spec and steering. 2. Inspect
existing implementation. 3. State a small change plan. 4. Implement the
change. 5. Run targeted tests. 6. Inspect the diff. 7. Update spec
status and documentation. 8. Record unresolved issues.

Do not regenerate working files without cause.

## 10. Beginner-friendly owner instructions

Whenever owner action is required, provide: - What to do - Why it is
required - Exact command or UI path - Where to run it - Expected
result - Common failure and resolution

Never request passwords or recovery codes. Use placeholders for secrets
and explain secure configuration.
