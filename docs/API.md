# public API

## Root Exports (`src/index.ts`)
- `sha256Hex(input)` from `src/core/hash.ts`
- Identifier helpers from `src/core/identifiers.ts`: `isValidPackId(value)`, `isValidCaseId(value)`, `containsPlaceholderToken(value)`
- Program normalization/validation from `src/core/program.ts`: `normalizeProgram(programInput)`
- `normalizeNewlines(text)` from `src/core/normalize.ts`
- `trimTrailingWhitespacePerLine(text)` from `src/core/normalize.ts`
- `normalizeText(text, options)` from `src/core/normalize.ts`
- `assertQuoteInvariant(docText, extraction)` from `src/core/invariants.ts`
- Types from `src/core/types.ts`: `DocumentInput`, `Span`, `Extraction`, `EvidenceBundle`, `EvidenceAttestation`, `Program`, `ProgramInput`, `PromptHashRecord`, `PromptLog`, `RunBudgets`, `BudgetLog`, `MultiPassLog`, `RunRepairLog`, `RunCompleteness`, `ShardOutcome`, `RunDiagnostics`
- Engine chunking from `src/engine/chunk.ts`: `chunkDocument(normalizedText, programHash, options)` where `options` include `documentId`, `chunkSize`, `overlap`, `offsetMode`
- Span mapping from `src/engine/mapSpan.ts`: `mapShardSpanToDocument(shard, shardSpan)`
- Checkpointing from `src/engine/checkpoint.ts`: `CheckpointStore`, `InMemoryCheckpointStore`, `buildCheckpointKey(runId, shardId)`
- Retry policy helpers from `src/engine/retry.ts`: `computeBackoffMs`, `computeJitterMs`, `computeRetryDelayMs`, `shouldRetry`
- Retryable executor from `src/engine/execute.ts`: `executeShardsWithCheckpoint(options)`
- Provider-backed engine run from `src/engine/run.ts`:
  - `runExtractionWithProvider(options)` for extraction-first legacy result shape
  - `runWithEvidence(options)` for run-produced `EvidenceBundle` including shard outcomes and explicit failure diagnostics
  - `runWithEvidence(options)` normalizes/validates `ProgramInput` into a deterministic structured `Program` shape (`programId`, `description`, `classes`, `constraints`)
  - Final `Extraction` records include top-level `offsetMode`, `charStart`, and `charEnd` (mirrored in `span`) and are validated by `assertQuoteInvariant`
  - Schema-first requests route through provider `generateStructured()`; text-only requests route through `generate()`
  - Extraction parsing prioritizes tool/function-call payload envelopes before text fallbacks for deterministic structured-output handling
  - `runWithEvidence(options)` diagnostics include:
    - `emptyResultKind`: `non_empty`, `empty_by_evidence`, or `empty_by_failure`
    - `runCompleteness.kind`: `complete_success`, `partial_success`, or `complete_failure`
    - per-run shard counts (`totalShards`, `successfulShards`, `failedShards`) to prevent silent partial-loss ambiguity
  - `runWithEvidence(options)` diagnostics include `promptLog` (`programHash`, per-shard `promptHash` records)
  - `runWithEvidence(options)` supports explicit budget controls:
    - `timeBudgetMs` (non-negative integer): run deadline for scheduling provider attempts
    - `repairBudgets.maxCandidateChars` and `repairBudgets.maxRepairChars` (positive integers)
    - `multiPassMaxPasses` (positive integer, default `2`): bounded draft→validate→repair→finalize pass count per shard
    - `nowMs` override for deterministic time-budget tests and replay
  - `runWithEvidence(options)` diagnostics include `budgetLog`:
    - `budgetLog.time`: effective `timeBudgetMs`, `startedAtMs`, `deadlineAtMs`, `deadlineReached`
    - `budgetLog.retry`: effective retry policy values
    - `budgetLog.repair`: effective repair caps and cap-hit counters
  - `runWithEvidence(options)` diagnostics include `multiPassLog`:
    - `multiPassLog.mode`: `draft_validate_repair_finalize`
    - `multiPassLog.maxPasses`: configured per-shard pass cap
    - `multiPassLog.shards[*]`: deterministic stage log with pass number, stage, status, and typed failure metadata
  - `runWithEvidence(options)` diagnostics include `repairLog`:
    - `repairLog.entries[*]`: shard-level typed repair metadata (`parseOk`, `changed`, applied step names, and repair budget truncation flags)
    - Repair log entries are redacted metadata only and contain no raw provider text
  - `buildProviderRequest(program, shard, model)`
  - `buildRepairProviderRequest(program, shard, model, context)`
- Evidence attestation:
  - `attestEvidenceBundle(bundle, options)` from `src/evidence/attest.ts`
  - `verifyEvidenceBundleAttestation(bundle, options)` from `src/evidence/verify.ts`
- Prompt compiler from `src/engine/promptCompiler.ts`: `compilePrompt(program, shard)`, `compileRepairPrompt(program, shard, context)`, `compilePromptParts(program, shard)`, `escapeUntrustedPromptText(text, markers)`, `hashPromptText(prompt)`
- Eval harness from `src/eval/runSuite.ts`: `runSuite(options)` with deterministic fake-mode and optional real-provider mode
- JSONL codecs from `src/io/jsonl.ts`: `encodeEvidenceBundlesToJsonl(bundles)`, `decodeJsonlToEvidenceBundles(input)`
- Visualization from `src/viz/html.ts`: `visualizeEvidenceBundle(bundles, options)`
- Schema builders from `src/schema/s.ts`: `s.string`, `s.number`, `s.boolean`, `s.literal`, `s.enum`, `s.array`, `s.object`, `s.union`, `s.optional`
- Schema validator: `validate(schema, value, options)` from `src/schema/validate.ts`
- JSON Schema generator: `toJsonSchema(schema)` from `src/schema/toJsonSchema.ts`
- Schema dialect normalization: `normalizeSchemaDialect(schema)` from `src/schema/normalizeDialect.ts`
- JSON extraction helpers from `src/json/extractJson.ts`: `extractFirstJson(text)`, `detectJsonFlavor(text)`
- Streaming frame decoder from `src/json/frameDecoder.ts`: `decodeStreamingJsonFrames(text)`
- JSON repair pipeline from `src/json/repair.ts`: `repairJsonText(input, options)` with `RepairLog` budget metadata (`maxCandidateChars`, `maxRepairChars`, truncation flags)
- JSON parser from `src/json/parse.ts`: `parseJsonStrict(text)`, `tryParseJsonStrict(text)`, `JsonParseFailure`
- Provider contracts from `src/providers/types.ts`: `Provider` (`generate(request)`, `generateStructured(request)`), `ProviderRequest`, `ProviderResponse` (includes `outputChannel`: `text` or `tool_call`)
- Provider error helpers from `src/providers/errors.ts`: `ProviderError`, `classifyProviderStatus`, `isTransientProviderError`
- Provider request hash helper from `src/providers/requestHash.ts`: `hashProviderRequest(request)`
- Fake provider test adapter from `src/providers/fake.ts`: `FakeProvider`
- OpenAI provider from `src/providers/openai.ts`: `OpenAIProvider`
- Gemini provider from `src/providers/gemini.ts`: `GeminiProvider`
- Ollama provider from `src/providers/ollama.ts`: `OllamaProvider`
- Node-only subpath export `ekchylisma/node`: `readEvidenceBundlesFromJsonlFile(path)`, `writeEvidenceBundlesToJsonlFile(path, bundles)`, `writeTextFile(path, content)` from `src-node/fs.ts`

## Contracts
- `contracts/span.schema.json`
- `contracts/extraction.schema.json`
- `contracts/program.schema.json`
- `contracts/evidence-bundle.schema.json`
- `contracts/evidence-attestation.schema.json`
- `contracts/json-schema-subset.schema.json`
- `contracts/repair-log.schema.json`
- `contracts/json-parse-error.schema.json`
- `contracts/document-shard.schema.json`
- `contracts/checkpoint-entry.schema.json`
- `contracts/provider-request.schema.json`
- `contracts/provider-response.schema.json`
- `contracts/provider-config.schema.json`
- `contracts/prompt-compiler.schema.json`
- `contracts/jsonl-io.schema.json`
- `contracts/viz-options.schema.json`
- `contracts/eval-metrics.schema.json`

## Schema Example
```ts
import { s, toJsonSchema, validate } from "ekchylisma";

const Ticket = s.object({
  title: s.string(),
  priority: s.enum(["low", "high"]),
  points: s.optional(s.number()),
});

const result = validate(Ticket, { title: "Bug", priority: "high" });
const schemaForProvider = toJsonSchema(Ticket);
```
