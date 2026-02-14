# Architecture

## Current Modules
- `src/core/types.ts`: shared contracts and ledgers.
- `src/core/hash.ts`: cross-runtime SHA-256 via WebCrypto.
- `src/core/normalize.ts`: deterministic normalization and ledgering.
- `src/core/invariants.ts`: quote/offset invariant enforcement.
- `src/engine/chunk.ts`: character-window chunking with overlap and deterministic shard IDs.
- `src/engine/mapSpan.ts`: shard-local to global span mapping validation.
- `src/engine/checkpoint.ts`: checkpoint store interface and in-memory implementation.
- `src/engine/retry.ts`: pure retry/backoff/jitter policy helpers.
- `src/engine/execute.ts`: resumable shard executor with checkpoint skip + transient retries.
- `src/engine/run.ts`: provider-driven end-to-end extraction orchestration.
- `src/engine/promptCompiler.ts`: deterministic boundary-safe prompt construction.
- `src/io/jsonl.ts`: runtime-agnostic JSONL encode/decode for evidence bundles.
- `src/json/extractJson.ts`: deterministic first-JSON extraction and JSON-vs-JSONL detection.
- `src/json/repair.ts`: bounded repair pipeline with forensic step logs.
- `src/json/parse.ts`: strict parser with structured error details.
- `src/providers/types.ts`: provider request/response interfaces and run metadata contract.
- `src/providers/errors.ts`: transient/permanent classification helpers.
- `src/providers/requestHash.ts`: deterministic request-hash helper for provider harnesses.
- `src/providers/fake.ts`: deterministic fake provider for tests and offline runs.
- `src/providers/openai.ts`: OpenAI Chat Completions adapter with optional structured output mode.
- `src/providers/gemini.ts`: Gemini `generateContent` adapter with optional response schema.
- `src/providers/ollama.ts`: Ollama `/api/chat` adapter with JSON/schema format mode.
- `src-node/fs.ts`: Node-only JSONL file adapter exposed via `ekchylisma/node`.
- `src/schema/s.ts`: dependency-free schema DSL with TypeScript inference.
- `src/schema/validate.ts`: deterministic validator with JSON pointer errors.
- `src/schema/toJsonSchema.ts`: limited JSON Schema subset generator.
- `contracts/`: JSON Schema representations of public contracts.
- `tools/orphan-check.ts`: verifies docs/contracts wiring is not orphaned.

## Boundary Rules
- Core modules are runtime-agnostic and web-API-first.
- Node-specific APIs are not used in core.
- Public docs and contract schemas are versioned with code.
