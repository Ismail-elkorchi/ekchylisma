# Decisions (ADR Log)

## ADR-0001: Bootstrap main directly for initial commit
- Date: 2026-02-14
- Context: Repository had no `HEAD` and no remote `main`, but the prompt suite requires PR-only workflow with `main` as base.
- Decision: Created the root commit directly on `main` with `MASTER_SPEC.md`, `.gitignore`, and `README.md`, then pushed `main`.
- Rationale: This is the only explicit exception allowed by the seed instructions before PR workflow can begin.
- Consequence: All substantive changes from prompt `01` onward are PR-only.

## ADR-0002: Normalization mapping strategy is explicitly non-reversible in prompt 01
- Date: 2026-02-14
- Context: Prompt 01 requires each normalization step to record a mapping strategy even if only non-reversible.
- Decision: `normalizeNewlines` and `trimTrailingWhitespacePerLine` both emit `mappingStrategy: "not_reversible"`.
- Rationale: This is the smallest compliant implementation while preserving ledger auditability.
- Consequence: Later prompts can upgrade to reversible mappings without breaking the ledger contract.

## ADR-0003: Schema generator targets a strict JSON Schema subset
- Date: 2026-02-14
- Context: Prompt 02 requires a JSON Schema generator without external dependencies while preserving portability.
- Decision: Generate only a strict subset (`type`, `properties`, `items`, `enum`, `const`, `required`, `additionalProperties`, `anyOf`).
- Rationale: A subset keeps provider integration deterministic and avoids broad, runtime-specific schema behavior.
- Consequence: Unsupported keywords are intentionally not generated.

## ADR-0004: JSON repair policy is bounded and allow-listed
- Date: 2026-02-14
- Context: Prompt 03 requires deterministic extraction+repair+parse while avoiding unbounded or speculative rewrites.
- Decision: Repairs are limited to four one-pass transforms in fixed order: `stripBOM`, `removeAsciiControlChars`, `trimOuterJunk`, `fixTrailingCommas`.
- Rationale: Bounded transforms improve auditability and reduce the risk of hidden semantic mutations.
- Consequence: Inputs requiring broader mutation fail with structured parse diagnostics instead of silent coercion.

## ADR-0005: Shard identity uses program hash + normalized shard text
- Date: 2026-02-14
- Context: Prompt 04 requires resumable chunk execution with deterministic shard IDs.
- Decision: `shardId = sha256(programHash + normalizedTextSlice)` and chunk boundaries are char-based with inclusive `start`, exclusive `end`.
- Rationale: Pairing program and content isolates shards across extraction programs while keeping IDs portable.
- Consequence: Changing normalization or chunk options changes shard IDs by design.
