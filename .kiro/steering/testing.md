# MIRROR Steering: Testing & Quality Assurance

## Quality Principles
- No code is complete without verification.
- Never mock away the engine's core logic in unit tests.
- Property-based testing via `fast-check` must be used to prove mathematical invariants:
  - Identical normalized inputs produce zero findings.
  - Missing is not zero.
  - Price changes remain detectable across currency formats.
  - Byte alteration in artifacts invalidates SHA-256 manifests.
- End-to-end integration must prove the entire pipeline:
  `Target URL -> Session Setup -> Journey Execution -> Observation Persistence -> Differential Discovery -> Finding Provenance -> Report Export`.
