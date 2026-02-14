# Public API

## Root Exports (`src/index.ts`)
- `sha256Hex(input)` from `src/core/hash.ts`
- `normalizeNewlines(text)` from `src/core/normalize.ts`
- `trimTrailingWhitespacePerLine(text)` from `src/core/normalize.ts`
- `normalizeText(text, options)` from `src/core/normalize.ts`
- `assertQuoteInvariant(docText, extraction)` from `src/core/invariants.ts`
- Types from `src/core/types.ts`: `Span`, `Extraction`, `EvidenceBundle`, `Program`

## Contracts
- `contracts/span.schema.json`
- `contracts/extraction.schema.json`
- `contracts/program.schema.json`
- `contracts/evidence-bundle.schema.json`
