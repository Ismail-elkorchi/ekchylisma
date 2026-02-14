# Architecture

## Current Modules
- `src/core/types.ts`: shared contracts and ledgers.
- `src/core/hash.ts`: cross-runtime SHA-256 via WebCrypto.
- `src/core/normalize.ts`: deterministic normalization and ledgering.
- `src/core/invariants.ts`: quote/offset invariant enforcement.
- `src/schema/s.ts`: dependency-free schema DSL with TypeScript inference.
- `src/schema/validate.ts`: deterministic validator with JSON pointer errors.
- `src/schema/toJsonSchema.ts`: limited JSON Schema subset generator.
- `contracts/`: JSON Schema representations of public contracts.
- `tools/orphan-check.ts`: verifies docs/contracts wiring is not orphaned.

## Boundary Rules
- Core modules are runtime-agnostic and web-API-first.
- Node-specific APIs are not used in core.
- Public docs and contract schemas are versioned with code.
