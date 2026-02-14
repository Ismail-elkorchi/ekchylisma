# Public API

## Root Exports (`src/index.ts`)
- `sha256Hex(input)` from `src/core/hash.ts`
- `normalizeNewlines(text)` from `src/core/normalize.ts`
- `trimTrailingWhitespacePerLine(text)` from `src/core/normalize.ts`
- `normalizeText(text, options)` from `src/core/normalize.ts`
- `assertQuoteInvariant(docText, extraction)` from `src/core/invariants.ts`
- Types from `src/core/types.ts`: `Span`, `Extraction`, `EvidenceBundle`, `Program`
- Engine chunking from `src/engine/chunk.ts`: `chunkDocument(normalizedText, programHash, options)`
- Span mapping from `src/engine/mapSpan.ts`: `mapShardSpanToDocument(shard, shardSpan)`
- Checkpointing from `src/engine/checkpoint.ts`: `CheckpointStore`, `InMemoryCheckpointStore`, `buildCheckpointKey(runId, shardId)`
- Retry policy helpers from `src/engine/retry.ts`: `computeBackoffMs`, `computeJitterMs`, `computeRetryDelayMs`, `shouldRetry`
- Retryable executor from `src/engine/execute.ts`: `executeShardsWithCheckpoint(options)`
- Schema builders from `src/schema/s.ts`: `s.string`, `s.number`, `s.boolean`, `s.literal`, `s.enum`, `s.array`, `s.object`, `s.union`, `s.optional`
- Schema validator: `validate(schema, value, options)` from `src/schema/validate.ts`
- JSON Schema generator: `toJsonSchema(schema)` from `src/schema/toJsonSchema.ts`
- JSON extraction helpers from `src/json/extractJson.ts`: `extractFirstJson(text)`, `detectJsonFlavor(text)`
- JSON repair pipeline from `src/json/repair.ts`: `repairJsonText(input)` with `RepairLog`
- JSON parser from `src/json/parse.ts`: `parseJsonStrict(text)`, `tryParseJsonStrict(text)`, `JsonParseFailure`

## Contracts
- `contracts/span.schema.json`
- `contracts/extraction.schema.json`
- `contracts/program.schema.json`
- `contracts/evidence-bundle.schema.json`
- `contracts/json-schema-subset.schema.json`
- `contracts/repair-log.schema.json`
- `contracts/json-parse-error.schema.json`
- `contracts/document-shard.schema.json`
- `contracts/checkpoint-entry.schema.json`

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
