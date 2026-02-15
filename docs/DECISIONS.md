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
- Status: superseded by ADR-0023
- Context: Prompt 04 requires resumable chunk execution with deterministic shard IDs.
- Decision: `shardId = sha256(programHash + normalizedTextSlice)` and chunk boundaries are char-based with inclusive `start`, exclusive `end`.
- Rationale: Pairing program and content isolates shards across extraction programs while keeping IDs portable.
- Consequence: Changing normalization or chunk options changes shard IDs by design.

## ADR-0006: Checkpoint key format and idempotent resume behavior
- Date: 2026-02-14
- Context: Prompt 05 requires survivable partial failure and deterministic resume semantics.
- Decision: Checkpoints are addressed by `ckpt:v1:<runId>:<shardId>` and executor reuses existing checkpoint values before invoking shard work.
- Rationale: Explicit run+shard scoping prevents collisions and preserves idempotent reruns.
- Consequence: Re-running with the same `runId` skips completed shards; changing `runId` creates an isolated checkpoint namespace.

## ADR-0007: Provider core uses deterministic request hashing and explicit error classes
- Date: 2026-02-14
- Context: Prompt 06 requires provider abstraction and offline deterministic testing.
- Decision: Define `Provider` request/response contracts, classify provider failures (`transient`/`permanent`), and use `FakeProvider` mapping by request hash.
- Rationale: Deterministic provider behavior is required for reproducible engine tests without network I/O.
- Consequence: End-to-end tests can run locally and still enforce quote invariants using realistic provider contracts.

## ADR-0008: Real providers are explicit fetch adapters without implicit env access
- Date: 2026-02-14
- Context: Prompt 07 requires OpenAI/Gemini/Ollama implementations with portable, dependency-free boundaries.
- Decision: Implement provider classes that accept config objects (`apiKey`, `baseUrl`, etc.), use `fetch` exclusively, and never read `process.env` internally.
- Rationale: Explicit config keeps core portable and testable across Node, Deno, Bun, and Workers.
- Consequence: Integration tests require caller-provided credentials and are skipped when env vars are missing.

## ADR-0009: Prompt compiler enforces trusted/untrusted boundary markers
- Date: 2026-02-14
- Context: Prompt 08 requires boundary-safe deterministic prompt formatting.
- Decision: Compiler always emits trusted program section first, then wraps shard text in fixed markers: `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT`.
- Rationale: Explicit boundaries mitigate prompt-injection confusion and keep format stable for testing.
- Consequence: Provider request builders rely on compiler output rather than ad-hoc string templates.

## ADR-0010: Core JSONL codec with isolated Node file adapter
- Date: 2026-02-14
- Context: Prompt 09 requires JSONL IO without introducing filesystem coupling in core.
- Decision: Implement codec in `src/io/jsonl.ts` and isolate filesystem helpers in `src-node/fs.ts` under `./node` export.
- Rationale: Keeps core portable across Node, Deno, Bun, and Workers while preserving ergonomic Node file utilities.
- Consequence: Consumers must import `ekchylisma/node` for fs-backed helpers.

## ADR-0011: Visualization output is self-contained HTML with embedded payload
- Date: 2026-02-14
- Context: Prompt 10 requires portable evidence visualization without external assets.
- Decision: `visualizeEvidenceBundle()` returns a single HTML string containing CSS, JS, and JSON payload.
- Rationale: Self-contained artifacts are easier to share and inspect across runtimes/environments.
- Consequence: Visualization HTML can be written directly to disk by Node example tooling.

## ADR-0012: Evaluation metrics are deterministic-first with optional real-provider mode
- Date: 2026-02-14
- Context: Prompt 11 requires drift/variance guardrails that run reliably in CI.
- Decision: `runSuite()` defaults to deterministic fake-provider mode and exposes optional real-provider mode via explicit provider injection.
- Rationale: Deterministic mode is required for stable CI signals; real-provider mode remains useful for manual benchmarking.
- Consequence: CI runs deterministic suite by default while preserving extensibility for external provider experiments.

## ADR-0013: Portability proof via shared scenario examples
- Date: 2026-02-14
- Context: Prompt 12 requires concrete runtime portability evidence.
- Decision: Implement one shared extraction scenario and expose runtime-specific entrypoints for Node, Deno, Bun, and Workers.
- Rationale: Shared scenario removes drift between runtime demos and makes behavior directly comparable.
- Consequence: `docs/PORTABILITY.md` can provide exact commands with a single expected output shape.

## ADR-0014: Orphan-check enforces contract/export/example coherence
- Date: 2026-02-14
- Context: Prompt 13 requires stronger coherence enforcement across system artifacts.
- Decision: Extend `tools/orphan-check.ts` to verify contract references, docs coverage for every `src/index.ts` export, and runtime example smoke runs.
- Rationale: Coherence failures should be detected automatically before merge.
- Consequence: Default check workflow now blocks drift in docs/contracts/examples.

## ADR-0015: Add Miniflare as a dev-only workers harness
- Date: 2026-02-15
- Context: MASTER_SPEC `REQ-4.2.2` requires explicit Workers compatibility validation with a local harness.
- Decision: Add `miniflare` as a `devDependency` and create `tests/workers/harness.test.ts`, runnable via `npm run test:workers`.
- Rationale: Miniflare pays the specific debt of verifiable Workers runtime behavior in CI without introducing runtime/package dependencies.
- Consequence: `package.json.dependencies` remains `{}` while CI gains a dedicated workers compatibility signal.

## ADR-0016: Pin CI actions by commit and enable weekly dependency automation
- Date: 2026-02-15
- Context: CI supply-chain hardening requires deterministic workflow execution and timely dependency updates.
- Decision:
  - Pin all GitHub Actions in CI workflows to full commit SHAs.
  - Add explicit least-privilege workflow permissions (`contents: read`).
  - Add `.github/dependabot.yml` for weekly updates of GitHub Actions and npm devDependencies.
- Rationale: Commit pinning and constrained permissions reduce workflow tampering risk; Dependabot provides controlled update cadence.
- Consequence: CI workflow maintenance requires SHA refreshes through reviewed PRs, with Dependabot generating update PRs on schedule.

## ADR-0017: Build distribution to dist/ with TypeScript compiler
- Date: 2026-02-15
- Context: Package exports pointing to `.ts` source are not a publishable Node distribution.
- Decision:
  - Add `tsconfig.build.json` and `npm run build` to emit ESM JavaScript + declaration files under `dist/`.
  - Update package exports to target `dist/esm/*` and `dist/types/*`.
  - Add `prepack` to enforce build before packaging.
- Rationale: Publishing runnable JavaScript artifacts avoids runtime dependence on TypeScript execution in consumers.
- Consequence: Release flow includes build output validation and browser compatibility harness checks.

## ADR-0018: Add deterministic bench harness with CI score gating
- Date: 2026-02-15
- Context: Repository quality claims require reproducible evidence, not ad-hoc examples.
- Decision:
  - Add `bench/` datasets, deterministic runner, and scorer.
  - Gate CI with `npm run bench` in a dedicated `bench` job.
  - Keep default benchmark mode deterministic via `FakeProvider`, with optional multi-trial variance mode.
- Rationale: Deterministic evidence reduces ambiguity in regression review and keeps benchmark checks fast in CI.
- Consequence: README/docs claims should reference benchmark outputs under `bench/results/`.

## ADR-0019: Add optional EvidenceBundle attestation with WebCrypto HMAC
- Date: 2026-02-15
- Context: Evidence bundles are portable audit artifacts, but integrity checks were not built into the contract.
- Decision:
  - Add optional `attestation` field on `EvidenceBundle`.
  - Implement `attestEvidenceBundle()` and `verifyEvidenceBundleAttestation()` using WebCrypto.
  - Use deterministic canonicalization (`ekchylisma-json-c14n-v1`) and `HMAC-SHA-256` with JWK `kty=oct`.
- Rationale: A dependency-free integrity check improves evidence transport safety across runtimes.
- Consequence: Integrators must manage key distribution and trust policy outside the library.

## ADR-0020: Disable Dependabot version-update PRs; keep config for security-update customization
- Date: 2026-02-15
- Context: Scheduled version-update PRs can accumulate open PRs and bypass repository-specific verification discipline.
- Decision:
  - Keep `.github/dependabot.yml` in the repository.
  - Set `open-pull-requests-limit: 0` for each configured ecosystem.
  - Keep schedule and ecosystem configuration so security-related configuration remains explicit.
- Rationale: This keeps update work inside reviewed maintainer PRs that follow the repository template, pinned-SHA checks, and full runtime matrix verification.
- Consequence: Dependency and workflow updates are applied through maintainer-authored PRs instead of unattended version-update PR streams.

## ADR-0021: Enforce pull request template headings in CI
- Date: 2026-02-15
- Context: Template presence alone does not guarantee consistent PR evidence sections.
- Decision:
  - Add `tools/pr-body-check.ts` to validate pull request body headings against `.github/PULL_REQUEST_TEMPLATE.md`.
  - Run `node tools/pr-body-check.ts` in the CI `node` job.
  - Keep checks event-aware so non-`pull_request` events skip validation cleanly.
- Rationale: A deterministic CI check prevents template drift and keeps verification/evidence sections uniform.
- Consequence: Pull requests missing required headings fail CI until body content is corrected.

## ADR-0022: Add explicit safe prompt interpolation and prompt hash diagnostics
- Date: 2026-02-15
- Context: REQ-10.2 requires explicit API support for safe prompt interpolation and prompt hash logging.
- Decision:
  - Add `escapeUntrustedPromptText()` and `hashPromptText()` to the prompt compiler API.
  - Escape marker token collisions in untrusted text before interpolation into bounded prompt sections.
  - Record `diagnostics.promptLog` in `runWithEvidence()` with `programHash` and per-shard `promptHash` values.
- Rationale: Explicit marker escaping and prompt hash logs improve boundary safety and post-run auditability.
- Consequence: Evidence bundle diagnostics and schema include prompt hash records for every shard.

## ADR-0023: Expand shard hash inputs with document and shard parameters
- Date: 2026-02-15
- Context: REQ-8.1.2 requires shard identity to include document and shard parameters, not only program hash and text slice.
- Decision:
  - Require `chunkDocument()` options to include `documentId` and `offsetMode`.
  - Derive `shardId` from hash input containing `programHash`, `documentId`, `chunkSize`, `overlap`, `offsetMode`, `shardStart`, `shardEnd`, and `shardText`.
  - Propagate `documentId`/`offsetMode` through run and evaluation call sites.
- Rationale: Including document/shard parameters prevents cross-document and cross-configuration shard identity collisions.
- Consequence: Existing chunking call sites must provide the expanded option set and tests must validate shard-id divergence across documents/parameters.

## ADR-0024: Add deterministic long-text fixture coverage
- Date: 2026-02-15
- Context: REQ-11.3.1 requires explicit long-text fixture coverage for chunking, span mapping, and quote invariant behavior.
- Decision:
  - Add `tests/fixtures/long-document.txt` as a deterministic long-text source.
  - Add `tests/engine/long-text-fixture.test.ts` covering chunking stability, span mapping stability, and quote invariant enforcement.
  - Extend `bench/datasets/smoke.jsonl` with a deterministic long-text case (`caseId=long-token`).
- Rationale: Long-input coverage must be a direct regression signal in the default runtime matrix and benchmark protocol.
- Consequence: Test and benchmark suites include long-text workload checks without introducing runtime dependencies.

## ADR-0025: Surface explicit run budgets for time, retries, and repair caps
- Date: 2026-02-15
- Context: REQ-9.2.2 requires explicit bounded behavior and diagnostics for repair/retry/time budget controls.
- Decision:
  - Extend `runWithEvidence()` options with `timeBudgetMs`, `repairBudgets`, and deterministic `nowMs` injection.
  - Add `diagnostics.budgetLog` containing effective time budget, retry policy values, and repair cap settings/counters.
  - Add `budget_exhausted` shard failure classification when deadline checks prevent provider attempt scheduling.
  - Extend JSON repair diagnostics with cap metadata (`maxCandidateChars`, `maxRepairChars`, truncation flags).
- Rationale: Explicit budget surfaces convert hidden control flow limits into auditable, typed diagnostics with deterministic test hooks.
- Consequence: Evidence bundle contract and fixture payloads include budget metadata; tests assert deadline and repair-cap behavior.

## ADR-0026: Separate internal research and enforce repository scope
- Date: 2026-02-15
- Context: The product repository must remain limited to implementation artifacts and reproducible user-facing evidence.
- Decision:
  - Add `docs/REPO_SCOPE.md` with explicit allowed/disallowed content classes.
  - Add `tools/repo-scope-check.ts` to fail when disallowed root paths (`internal/`, `research/`, `signals/`, `plans/`, `projects/`) exist.
  - Require `npm run repo-scope-check` in `npm run check` and enforce script wiring via `tools/oss-check.ts`.
- Consequences:
  - Internal research and planning artifacts are blocked from accidental commit to the product repository.
  - Scope policy violations become deterministic CI/local check failures.
- Verification commands:
  - `npm run repo-scope-check`
  - `npm run oss-check`
  - `npm run check`

## ADR-0027: semantic-identifiers-and-placeholder-ban
- Date: 2026-02-15
- Context: Regression records and repository artifacts require deterministic grammar and policy enforcement to prevent identifier drift and boundary leakage.
- Decision:
  - Add `src/core/identifiers.ts` with grammar checks for `packId` and `caseId` plus placeholder marker detection.
  - Add `tools/repo-text-check.ts` and run it through `npm run check`.
  - Enforce forbidden path patterns, identifier grammar, and placeholder-token bans without ordinary-word policing.
  - Require `sourceQuote` and strict semantic identifier formats in regression dataset validation.
- Consequence:
  - CI blocks merges that violate semantic identifier grammar or boundary policy.
  - Regression records require source-linked quote evidence and deterministic identifiers.

## ADR-0028: multi-pass-execution-model
- Date: 2026-02-15
- Context: REQ-8.2.1 required a deterministic multi-pass execution pipeline. Single-pass shard processing converted first-pass parse/shape/quote errors into terminal failures even when a corrected response was available.
- Decision:
  - Add bounded shard pass execution with fixed stage sequence: `draft -> validate -> repair -> finalize`.
  - Add `buildRepairProviderRequest()` and `compileRepairPrompt()` for deterministic repair-pass prompt construction.
  - Add `diagnostics.multiPassLog` with per-shard stage entries including pass index, stage, status, failure kind, and failure message.
  - Add regression harness support for scripted `multi_pass_v1` provider responses in benchmark and runtime tests.
- Consequence:
  - First-pass payload-shape and quote-invariant failures can converge on pass two without changing retry semantics for provider transport failures.
  - Evidence bundles include deterministic stage logs for pass-by-pass execution review.

## ADR-0029: provider-structured-generate-split
- Date: 2026-02-15
- Context: REQ-9.1.1 required explicit separation of free-text generation from schema-first structured generation. A single provider method allowed schema-first paths to drift into text-format responses.
- Decision:
  - Split provider contract into `generate()` and `generateStructured()`.
  - Route schema-bearing requests through `generateStructured()` in engine run paths.
  - Extend `FakeProvider` with separate structured response mapping for deterministic regression control.
  - Add structured-split regression scripts and tests that fail on text-channel fallback.
- Consequence:
  - Provider adapters expose explicit structured execution semantics.
  - Schema-first extraction paths become deterministic and verifiable through regression dataset cases.

## ADR-0030: repair-log-in-diagnostics
- Date: 2026-02-15
- Context: REQ-7.1.2 required explicit repair visibility in run diagnostics. Existing evidence exposed repair metadata only through per-shard pipeline logs and did not provide a typed run-level repair ledger.
- Decision:
  - Add `diagnostics.repairLog.entries` with typed, bounded, redacted repair metadata.
  - Populate repair-log entries for both success and failure paths whenever JSON repair/parse diagnostics are available.
  - Keep entries text-free and store only step names, parse status, change flags, and budget truncation metadata.
- Consequence:
  - Evidence bundles provide deterministic run-level repair audit data.
  - Downstream tooling can query repair behavior without scanning per-outcome structures.

## ADR-0031: executor-evidence-classification
- Date: 2026-02-15
- Context: REQ-7.4.1 and REQ-8.3.1 require explicit distinction between empty-by-evidence and empty-by-failure while also preserving partial shard success semantics.
- Decision:
  - Add `diagnostics.runCompleteness` with explicit kind (`complete_success`, `partial_success`, `complete_failure`) and shard counts.
  - Add `classifyRunCompleteness()` in executor utilities and consume it in `runWithEvidence()`.
  - Keep `emptyResultKind` independent from completeness so zero-extraction success and zero-extraction failure remain distinct.
- Consequence:
  - Evidence bundles expose deterministic, machine-readable partial-success state without collapsing successful shard output.
  - Consumers can safely gate on both `emptyResultKind` and `runCompleteness` without inferring behavior from raw shard arrays.

## ADR-0032: program-shape-alignment
- Date: 2026-02-15
- Context: REQ-6.2.1 requires `Program` to be represented as structured intent/configuration data rather than only prompt text, with deterministic validation behavior.
- Decision:
  - Introduce `ProgramInput` normalization into a structured `Program` shape containing `programId`, `description`, `classes`, and `constraints`.
  - Validate and normalize programs in run entrypoints and reject invalid shapes with deterministic error messages.
  - Update prompt compilation to include structured program fields (`description`, `classes`, `constraints`) and update program contract schema.
- Consequence:
  - Callers can provide legacy-compatible inputs, but run artifacts and diagnostics always carry a deterministic structured program model.
  - Program shape drift is contract-checked and regression-tested.

## ADR-0033: extraction-offsets-alignment
- Date: 2026-02-15
- Context: REQ-6.4.1 and REQ-7.1.1 require final extractions to carry explicit top-level character offsets into the original document and enforce deterministic quote/offset validation rules.
- Decision:
  - Extend `Extraction` to require top-level `offsetMode`, `charStart`, and `charEnd` while preserving `span` as a mirrored field.
  - Expand shard parsing to accept top-level offsets, legacy `span` offsets, or both, and reject mismatched dual representations.
  - Update quote invariant enforcement to validate offset mode support, top-level/span consistency, bounds, and exact quote matching.
- Consequence:
  - Evidence bundles carry unambiguous top-level offsets on every extraction and reject ambiguous offset payloads deterministically.
  - Consumers can rely on one explicit offset surface (`charStart`/`charEnd`) without silent span drift.

## ADR-0034: schema-dialect-normalization
- Date: 2026-02-15
- Context: Provider adapters consume JSON Schema payloads, but dialect-specific keywords (`$schema`, `nullable`, legacy metadata) can cause inconsistent behavior across backends.
- Decision:
  - Add `normalizeSchemaDialect()` to canonicalize supported dialect metadata into the JsonSchemaSubset form used internally.
  - Reject unsupported dialect-only keywords (`definitions`, `$defs`, `$ref`, `oneOf`, `allOf`, etc.) with deterministic errors.
  - Normalize program schemas before hashing/storage and normalize provider request schemas before transport.
- Consequence:
  - Equivalent schemas across supported dialect markers map to one deterministic internal representation.
  - Provider requests avoid dialect drift and fail fast on unsupported schema constructs.
