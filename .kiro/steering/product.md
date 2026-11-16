# MIRROR Steering: Product Intent & Core Workflow

## Mission
Build a working software platform that runs controlled, isolated browser experiments against authorized websites, records what each browser session experiences, identifies meaningful differences, and produces reproducible, evidence-backed investigation reports.

## Core Principles
1. **Deterministic Core:** Deterministic execution, observation capture, and differential comparison is the authoritative source of truth. The application must remain 100% functional without AI.
2. **AI as an Interpretation Layer:** AI is an optional, read-only layer for synthesizing findings, drafting hypotheses, and suggesting confirmation experiments. AI may not invent evidence, browse independently, or execute transactions.
3. **Evidence Integrity:** Original observations and artifacts are immutable. Findings must explicitly cite observation IDs and verifiable evidence.
4. **Honest Reporting:** Report what was observed under which conditions. Do not equate observed differences with deliberate misconduct or unlawful discrimination without conclusive controlled evidence.
5. **Security & Boundary Isolation:** Test only authorized domains. Enforce strict SSRF protection, secret redaction, and isolated browser sandboxing.
