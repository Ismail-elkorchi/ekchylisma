# ekchylisma Spec

This file is the implementation-facing spec derived from `MASTER_SPEC.md`.

## Prompt-01 anti-drift summary (5 bullets)
- Core contracts are required: `Program`, grounded `Extraction`, and auditable `EvidenceBundle`.
- Quote invariant is mandatory: `document.slice(charStart, charEnd) === quote`.
- Core code must stay web-API-first and avoid Node-only APIs.
- Runtime dependencies are forbidden; `package.json` keeps `dependencies` empty.
- Docs, contracts, and tests must evolve together and pass `orphan-check`.

## Invariants
- Offsets use UTF-16 code unit indexing with inclusive `charStart` and exclusive `charEnd`.
- `assertQuoteInvariant` validates integer spans, bounds, and exact quote matching.
- Normalization emits a ledger entry per step with explicit mapping strategy.

## Portability Constraints
- Core uses `crypto.subtle` for hashing.
- Core does not require filesystem access.
- Runtime-specific adapters are isolated behind dedicated entrypoints.
