# ekchylisma

Web-API-first, zero-runtime-dependency extraction engine for agent workflows.\
Primary output is an auditable `EvidenceBundle` with grounded spans, shard
outcomes, and explicit failure diagnostics.

## Quickstart

### 1) Run tests

```bash
npm test
npm run test:deno
npm run test:bun
npm run test:browser
npm run test:workers
```

### 2) Run portability examples

```bash
node examples/node/basic.ts
deno run examples/deno/basic.ts
bun run examples/bun/basic.ts
```

### 3) Programmatic run with evidence

```ts
import { FakeProvider, runWithEvidence, sha256Hex } from "./src/index.ts";

const program = {
  instructions: "Extract token Beta.",
  examples: [],
  schema: { type: "object" },
  programHash: await sha256Hex("Extract token Beta."),
};

const provider = new FakeProvider({
  defaultResponse:
    '{"extractions":[{"extractionClass":"token","quote":"Beta","span":{"offsetMode":"utf16_code_unit","charStart":6,"charEnd":10},"grounding":"explicit"}]}',
});

const bundle = await runWithEvidence({
  runId: "hello",
  program,
  document: { documentId: "doc-1", text: "Alpha Beta" },
  provider,
  model: "fake-model",
  chunkSize: 64,
  overlap: 0,
});
```

## Invariants

- Quote/offset invariant: `document.slice(charStart, charEnd) === quote` for
  every accepted extraction.
- No silent parser fallback: provider text goes through deterministic
  `extractFirstJson -> repairJsonText -> parseJsonStrict`.
- Empty result is explicit: `diagnostics.emptyResultKind` is one of `non_empty`,
  `empty_by_evidence`, `empty_by_failure`.
- Runtime dependency policy: `package.json.dependencies` stays `{}`.
- Runtime-specific APIs are isolated; core stays web-API-first.

## Failure Modes

- `json_pipeline_failure`: model output cannot be repaired/parsed as valid JSON.
- `provider_error`: transient/permanent provider failures
  (HTTP/status-classified).
- `payload_shape_failure`: parsed JSON does not match required extraction
  payload shape.
- `quote_invariant_failure`: span/quote mismatch after mapping to global
  offsets.
- `unknown_failure`: uncategorized execution error.

All failures are recorded in `EvidenceBundle.diagnostics.failures` and linked to
shard-level outcomes.

## Portability Matrix

| Target             | Status                       | Local Command                     |
| ------------------ | ---------------------------- | --------------------------------- |
| Node Active LTS    | Required                     | `node examples/node/basic.ts`     |
| Deno stable        | Required                     | `deno run examples/deno/basic.ts` |
| Bun stable         | Required                     | `bun run examples/bun/basic.ts`   |
| Cloudflare Workers | Required                     | `npm run test:workers`            |
| Browser            | Supported (bundling harness) | `npm run test:browser`            |

## Debug with EvidenceBundle

1. Check `diagnostics.emptyResultKind` first.
2. Inspect `diagnostics.shardOutcomes`:
   - `status: "success"` includes shard extractions + provider record + JSON
     pipeline log.
   - `status: "failure"` includes an explicit typed failure object.
3. For parser issues, inspect `jsonPipelineLog`:
   - `extractedJson` for fence/prose trimming behavior
   - `repair.steps` for bounded mutation history
   - `parse.error` for exact parse position/snippet
4. Use `provenance` + `program` + `shardPlan` to reproduce the run
   deterministically.

## Docs

- API: `docs/API.md`
- Portability: `docs/PORTABILITY.md`
- Threat model: `docs/THREAT_MODEL.md`
- Secure integration: `docs/SECURE_INTEGRATION.md`
- Evidence attestation: `docs/EVIDENCE_ATTESTATION.md`
- Bench protocol: `bench/README.md`
- Decisions/ADRs: `docs/DECISIONS.md`
- OSS practices: `docs/OSS_PRACTICES.md`
- Baseline audit: `docs/BASELINE_AUDIT.md`
- Master contract: `MASTER_SPEC.md`

## Project Operations

- Security reporting: `SECURITY.md`
- Contribution workflow: `CONTRIBUTING.md`
- Collaboration norms: `CODE_OF_CONDUCT.md`
- Governance and fork policy: `GOVERNANCE.md`
- Support channels: `SUPPORT.md`
- Change history: `CHANGELOG.md`
- Release procedure: `RELEASE.md`
