# ekchylisma Spec

This file is the implementation-facing spec derived from `MASTER_SPEC.md`.

## Prompt-01 anti-drift summary (5 bullets)
- Core contracts are required: `Program`, grounded `Extraction`, and auditable `EvidenceBundle`.
- Quote invariant is mandatory: `document.slice(charStart, charEnd) === quote`.
- Core code must stay web-API-first and avoid Node-only APIs.
- Runtime dependencies are forbidden; `package.json` keeps `dependencies` empty.
- Docs, contracts, and tests must evolve together and pass `orphan-check`.

## Prompt-02 anti-drift summary (5 bullets)
- Schema DSL is dependency-free and implemented with local builders only.
- `validate()` returns deterministic structured errors with JSON pointer paths.
- JSON Schema generation is constrained to the documented project subset.
- Optional fields are represented explicitly and compile-time inference is preserved.
- Every new schema API is mirrored in docs, contracts, and tests.

## Prompt-03 anti-drift summary (5 bullets)
- JSON extraction must deterministically find the first complete object/array payload in mixed text.
- Repair operations are bounded and explicitly allow-listed.
- Every applied (or skipped) repair step is logged in a `RepairLog`.
- JSON parsing is strict and returns rich structured diagnostics on failure.
- JSONL is detected heuristically, but JSONL streaming IO remains out of scope until the IO prompt.

## Invariants
- Offsets use UTF-16 code unit indexing with inclusive `charStart` and exclusive `charEnd`.
- `assertQuoteInvariant` validates integer spans, bounds, and exact quote matching.
- Normalization emits a ledger entry per step with explicit mapping strategy.

## Portability Constraints
- Core uses `crypto.subtle` for hashing.
- Core does not require filesystem access.
- Runtime-specific adapters are isolated behind dedicated entrypoints.

## Schema Subset Rules
- Supported builders: `string`, `number`, `boolean`, `literal`, `enum`, `array`, `object`, `union`, `optional`.
- Validator is strict on object properties by default and rejects unexpected keys.
- Error paths follow JSON Pointer escaping (`~` to `~0`, `/` to `~1`).
- Validator caps recursion depth and error volume for deterministic bounded execution.

## JSON Pipeline Rules
- `extractFirstJson()` scans text left-to-right and returns the first complete JSON object or array slice.
- Allowed repairs: strip BOM, remove disallowed ASCII control chars, trim wrapper junk around the first extracted JSON slice, remove trailing commas before `]` or `}`.
- Repair order is fixed and one-pass per step to preserve bounded behavior.
- Parse failures must surface a structured `JsonParseError` object, not a raw uncaught exception.
