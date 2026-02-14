````markdown
# ekchylisma — MASTER_SPEC.md (Draft, 2026-02-14)

> This is the single source of truth for ekchylisma’s **public contracts**, **invariants**, **threat model**, **portability targets**, and **acceptance tests**.
>
> **Evidence rule:** every normative requirement in this spec includes an “Evidence” clause that points to (a) the project brief, and/or (b) external sources listed in **Appendix A**.

---

## 0) Epistemic stance, pluralism, and scope discipline

### 0.1 Explicit hypotheses (no hidden assumptions)

All statements below are treated as **hypotheses** unless they are either:
- A direct requirement from the project brief, or
- Supported by an external source in Appendix A.

**H0 (LLM output is not a proof):** An LLM response is an *untrusted, stochastic artifact*, not a ground-truth certificate.  
**Evidence:** OWASP identifies multiple failure/attack classes for LLM apps (prompt injection, insecure output handling, etc.). See [S19].

**H1 (Long context ≠ reliable recall):** Increasing context size does not guarantee proportional task success; retrieval/position effects and multi-fact degradation exist.  
**Evidence:** “Lost in the Middle” shows position effects and degraded performance in long contexts; LongBench and RULER benchmark long-context behavior. See [S24], [S25], [S26].

**H2 (Structured outputs are useful but incomplete):** Constraining outputs (JSON Schema / grammar / regex) improves schema compliance but does not automatically solve semantic correctness, coverage, or efficiency.  
**Evidence:** JSONSchemaBench evaluates constrained decoding across compliance/coverage/efficiency dimensions; major frameworks vary. See [S23]. vLLM documents multiple constraint modes. See [S22].

**H3 (Extraction pipelines fail in practice):** Even production libraries encounter transient API failures, parsing failures, and silent or partial failures.  
**Evidence:** LangExtract and a TS port have issues: overload/503; JSONL/predictions parse issues; invalid control characters; slow multi-pass on long docs; fenced JSON parsing errors; silent empty outputs; provider/model-id bugs. See [S4], [S5], [S6], [S7], [S8], [S9], [S10].

**H4 (Measurement variance is real):** Small changes in prompts/models/procedure can yield large shifts in results.  
**Evidence:** Variance-aware annotation work reports large swings under small variations and proposes a protocol. See [S28].

### 0.2 Pluralism guarantee (design, not ideology)

ekchylisma MUST support **multiple** extraction strategies without forcing a single worldview:
- Constrained decoding when available (JSON Schema / grammar / regex)
- Parser + repair loops when constraints are unavailable
- Multi-pass strategies for long documents
- Multiple provider adapters, including OpenAI-compatible, Gemini-compatible, and local servers (as “HTTP LLM”)

**Evidence:** LangExtract explicitly positions itself as supporting multiple LLM backends and multiple extraction passes; vLLM and OpenAI-compatible servers expose multiple constraint modes; Cloudflare Workers emphasizes web API portability across runtimes. See [S3], [S2], [S22], [S20], [S15].

---

## 1) Normative language

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as in RFC 2119, with the capitalization clarification from RFC 8174 (only uppercase carries the special meaning).  
**Evidence:** RFC 2119 and RFC 8174. See [S18].

---

## 2) Mission

### 2.1 What ekchylisma is

ekchylisma is a **vanilla TypeScript** library for **LLM-powered information extraction** that produces:
1) Structured outputs that conform to a declared schema, and  
2) **Precise source grounding**: every extracted span is linked to **character offsets** in the original text, with optional human inspection artifacts (HTML).  
**Evidence:** LangExtract’s stated purpose and features include “precise source grounding” via exact character offsets and interactive visualization. See [S2], [S3].

### 2.2 What ekchylisma is for

ekchylisma is designed primarily for **coding agents and LLM workflows**, meaning:
- Contracts are machine-readable.
- Failure modes are explicit and typed.
- Runs are reproducible via recorded inputs/options/versions.
- There are anti-drift guards to keep docs/spec/code aligned.

**Evidence:** Agent workflows degrade under long contexts and accumulation of errors; splitting work into smaller units and maintaining explicit contracts mitigates context overload and drift. See [S24], [S25], [S26], [S27].

### 2.3 Hard constraints (from the project brief)

REQ-2.3.1 — **No runtime dependencies**: the published package MUST have **zero runtime deps** (no `dependencies`).  
REQ-2.3.2 — **Dev dependencies allowed**: `devDependencies` MAY be used if each one has an explicit, documented “debt it pays”.  
REQ-2.3.3 — Targets: MUST run on:
- Latest Node.js **Active LTS** (and also on Maintenance LTS as a best-effort),  
- Latest stable Deno,  
- Latest stable Bun,  
- Cloudflare Workers (workerd/Wrangler),  
- Browser support is a SHOULD if feasible without runtime deps.

**Evidence:** Project brief [B1]. Node LTS lifecycle published by Node.js. Deno stability/release cycle documented. Bun provides Web API support and aims for Node compatibility. Cloudflare Workers runtime is web-interoperable and supports Node compatibility flags where needed. See [S11], [S12], [S13], [S14], [S15].

---

## 3) Non-goals (explicit)

NG-3.1 — ekchylisma is NOT a PDF/OCR system. Input is **text** (or text already extracted upstream).  
**Evidence:** Real-world long-document extraction already strains performance and multi-pass time; expanding scope to OCR/PDF parsing increases complexity beyond the extraction core. See long-doc performance reports/issues [S7] and long-context findings [S24–S26]. Also project brief constraint prioritizes portability and minimal deps [B1].

NG-3.2 — ekchylisma is NOT a vector database, retriever, or RAG framework.  
**Evidence:** Prompt injection risk exists in retrieval pipelines; extraction core should remain minimal and composable. See [S19], [S9]. Project brief prioritizes a dependency-free core [B1].

NG-3.3 — ekchylisma is NOT a provider SDK replacement; provider adapters are thin HTTP clients.  
**Evidence:** Provider interoperability and OpenAI-compatible servers exist; keeping adapters small improves portability and reduces breakage surface (seen in model-id transformation bug). See [S10], [S20], [S22].

---

## 4) Portability model

### 4.1 “Web-API first” rule

REQ-4.1.1 — Core MUST use **web platform APIs** when possible:
- `fetch`
- Web Crypto (`globalThis.crypto.subtle`)
- Streams / TextEncoder/TextDecoder
- URL, Headers, Request, Response

**Evidence:** Cloudflare Workers runtime is web-interoperable and encourages web platform APIs; Node provides fetch and Web Crypto; Bun implements WHATWG fetch; Deno is web-standards oriented and stabilizes its APIs. See [S15], [S16], [S14], [S12], [S17].

REQ-4.1.2 — Node-only APIs (fs/path/process) MUST NOT be required by the core entrypoint. Node-only features must live behind explicit entrypoints (e.g., `ekchylisma/node`).  
**Evidence:** Cloudflare Workers requires compatibility flags for Node APIs and has runtime constraints (e.g., request-scoped work inside handlers). Keeping core web-API-first maximizes reuse across WinterCG-style runtimes. See [S15].

### 4.2 Runtime targets and “definition of done” for portability

REQ-4.2.1 — CI MUST execute a test matrix across:
- Node Active LTS (and Maintenance LTS as a second line if feasible),
- Deno stable,
- Bun stable.

**Evidence:** GitHub Actions supports matrix strategies for multi-environment testing. See [S29]. Node and Deno publish release lifecycles. See [S11], [S12], [S13].

REQ-4.2.2 — Workers support MUST be validated with a minimal Worker test harness (local workerd/miniflare is acceptable as a dev dependency).  
**Evidence:** Workers runtime documentation and best practices specify environment constraints and patterns. See [S15].

REQ-4.2.3 — Browser support SHOULD be validated by running a subset of tests in a headless browser runner (dev dependency).  
**Evidence:** Fetch/WebCrypto are browser standards. See [S17].

---

## 5) Core problem decomposition

ekchylisma addresses three separable problem layers:

1) **Intent & schema** (“What to extract?”)  
2) **Model interaction** (“How to ask + constrain?”)  
3) **Grounding & audit** (“How to prove where it came from?”)

This separation MUST be reflected in module boundaries and public contracts.  
**Evidence:** LangExtract’s feature list separates schema enforcement, long-context strategy, and grounding/visualization; failures observed in ports often stem from mixing prompt formatting/parsing/provider logic (silent failures, parse failures, model-id bugs). See [S3], [S8], [S9], [S10].

---

## 6) Public data contracts (system boundary)

### 6.1 Document model

REQ-6.1.1 — Input document MUST be treated as an immutable string with an optional `documentId`.  
**Evidence:** LangExtract operates on text/documents and associates IDs; stable IDs are required for caching/resume. See [S2], [S3]. Failures in long docs benefit from shard-level resume. See [S7].

```ts
export type DocumentInput = {
  documentId?: string;   // if absent, generated deterministically
  text: string;          // UTF-16 JS string (raw input)
  meta?: Record<string, string>;
};
````

### 6.2 Program model (“extraction program”)

REQ-6.2.1 — The extraction task MUST be represented as a structured `Program` object, not only as a prompt string.
**Evidence:** Prompt/procedure variance can shift results; recording a structured program is required for diagnostics and repeatability. See [S28]. LangExtract relies on a prompt description + few-shot examples; formalizing this improves machine use. See [S3].

```ts
export type Program = {
  programId?: string;          // if absent, content-hash derived
  description: string;         // human + agent readable intent
  classes: Array<{
    name: string;              // extraction_class
    attributesSchema?: JsonSchemaSubset; // see 6.3
    allowInferred?: boolean;   // default false
  }>;
  examples: Example[];         // few-shot
  constraints?: {
    requireExactQuote?: boolean;   // default true
    forbidOverlap?: boolean;       // default true
    maxExtractionsPerShard?: number;
  };
};
```

### 6.3 JSON Schema subset (portable, dependency-free)

REQ-6.3.1 — ekchylisma MUST define and support a **documented JSON Schema subset** (“JsonSchemaSubset”) sufficient for:

* Object properties
* Arrays
* Strings / numbers / booleans
* Enums
* Required fields

**Evidence:** Constrained decoding frameworks standardize around JSON Schema, but real-world schema coverage varies; limiting to a subset improves portability and allows a custom validator without dependencies. See [S23], [S22]. OpenAI and Bedrock offer schema-based structured outputs. See [S20], [S21].

### 6.4 Extraction record (grounded)

REQ-6.4.1 — Every extraction MUST include:

* `extractionClass`
* `quote` (exact substring)
* `charStart` / `charEnd` offsets into the **original** document text
* `attributes` (JSON)
* `grounding` mode (`explicit` vs `inferred`)

**Evidence:** Precise source grounding (exact character offsets) is a core LangExtract feature for traceability. See [S3], [S2]. “Inferred” info can be produced, but must be labeled; LangExtract discusses inferred vs explicit. See [S3].

```ts
export type Extraction = {
  extractionClass: string;
  quote: string;
  charStart: number; // inclusive
  charEnd: number;   // exclusive
  attributes?: Record<string, unknown>;
  grounding: "explicit" | "inferred";
  confidence?: {
    kind: "model_reported" | "self_consistency" | "heuristic";
    value: number; // 0..1
  };
};
```

### 6.5 Evidence bundle (“what makes it auditable”)

REQ-6.5.1 — A run MUST produce an `EvidenceBundle` containing enough information to reproduce:

* the exact input text (or a content hash + pointer),
* the program,
* shard strategy,
* provider request/response metadata (redacted where needed),
* normalization ledger (see 7.2),
* failures and repair attempts.

**Evidence:** Real systems see silent failures and parsing failures; without audit artifacts you cannot distinguish “no entities exist” from “pipeline broke.” See TS port silent failure issue [S9] and LangExtract parsing/overload issues [S4–S6]. Variance-aware protocols demand recording procedure choices. See [S28].

```ts
export type EvidenceBundle = {
  bundleVersion: "1";
  runId: string;
  runtime: { name: "node" | "deno" | "bun" | "workers" | "browser"; version: string };
  libraryVersion: string;
  program: Program;
  document: { documentId: string; textHash: string; textLength: number };
  shardPlan: ShardPlan;
  results: Array<{ shardId: string; extractions: Extraction[] }>;
  diagnostics: RunDiagnostics;
};
```

---

## 7) Invariants (must always hold)

### 7.1 Quote/offset invariant

REQ-7.1.1 — For every extraction in final output:
`document.text.slice(charStart, charEnd) === quote` MUST be true.
**Evidence:** “Precise source grounding” in LangExtract requires mapping to exact character offsets and highlights spans in original text. See [S3].

REQ-7.1.2 — If the invariant cannot be satisfied, the extraction MUST be rejected or repaired (alignment step) and the repair MUST be logged in diagnostics.
**Evidence:** Both LangExtract and TS port show parsing/alignment issues; silent wrong outputs are unacceptable. See [S5], [S8], [S9].

### 7.2 Normalization ledger invariant

REQ-7.2.1 — If the system applies any text normalization (e.g., newline normalization, Unicode cleanup), it MUST maintain a reversible mapping (or explicit “lossy” flag) so char offsets remain meaningful against original text.
**Evidence:** Offset grounding relies on exact character positions; long-doc processing and parsing issues show the need for robust, auditable handling. See [S3], [S7].

### 7.3 Provider model-id opacity invariant

REQ-7.3.1 — Model IDs MUST be treated as opaque strings; no prefix stripping, rewriting, or normalization unless explicitly requested by the caller.
**Evidence:** TS port bug strips provider prefixes and breaks OpenRouter compatibility. See [S10].

### 7.4 “No silent failure” invariant

REQ-7.4.1 — The library MUST distinguish:

* **Empty-by-evidence**: validated run produced zero extractions and no constraint/parse errors, vs
* **Empty-by-failure**: parsing/constraint failure, provider error, timeout, etc.

**Evidence:** TS port issue reports empty `extractions[]` with no error due to malformed prompt + silent parser behavior. See [S9].

---

## 8) Execution model (shards, passes, resume)

### 8.1 Sharding strategy

REQ-8.1.1 — For long documents, ekchylisma MUST support a sharding strategy with:

* bounded shard size (characters),
* overlap (configurable),
* deterministic shard IDs.

**Evidence:** LangExtract states it uses chunking, parallel processing, and multiple passes for long-context extraction. See [S3]. Long-context benchmarks show degradation and motivate smaller focused contexts. See [S24–S26].

REQ-8.1.2 — Shard ID MUST be derived from:
`hash(programId + documentId + normalizedShardText + shardParams)` using Web Crypto SHA-256.
**Evidence:** Web Crypto is supported across Node, Deno, Bun, Workers; using it avoids runtime deps. See [S16], [S15], [S14], [S17].

### 8.2 Multi-pass extraction

REQ-8.2.1 — The engine MUST support `passes >= 1`, where each pass can change either:

* prompts (e.g., “broad pass” then “class-specific pass”), or
* constraints (e.g., strict schema, then repair), or
* shard plan (e.g., zoom-in on regions).

**Evidence:** LangExtract explicitly mentions “multiple extraction passes over smaller, focused contexts.” See [S3]. Long-doc performance reports show multi-pass can be expensive; the engine must make it explicit and resumable. See [S7].

### 8.3 Resume and partial success

REQ-8.3.1 — The engine MUST produce partial results if some shards succeed and others fail, unless the caller requests “all-or-nothing.”
**Evidence:** LangExtract issue reports a single shard failure causes the full call to fail. See [S4]. Long-horizon agent tasks benefit from partial progress preservation. See [S27].

REQ-8.3.2 — A run MUST be resumable from an on-disk (Node) or in-memory (other runtimes) checkpoint that records per-shard status.
**Evidence:** Transient overload errors (503) occur and may consume quota; resumability reduces repeated work. See [S4].

---

## 9) Provider abstraction (no SDK lock-in)

### 9.1 Minimal provider interface

REQ-9.1.1 — Provider adapters MUST implement a minimal interface:

* `generateStructured()` returning either:

  * schema-conformant JSON (preferred), or
  * raw text + metadata (fallback)

**Evidence:** OpenAI offers structured outputs; Bedrock offers structured outputs; vLLM supports guided JSON/regex/grammar. See [S20], [S21], [S22].

REQ-9.1.2 — Provider adapters MUST support an “OpenAI-compatible” HTTP mode (baseURL + headers) without altering model IDs.
**Evidence:** Model-id rewriting breaks OpenRouter; OpenAI-compatible servers exist. See [S10], [S22], [S20].

### 9.2 Fences and parser hardening

REQ-9.2.1 — Parsing MUST tolerate:

* leading/trailing prose,
* fenced code blocks (`json ... `),
* minor JSON formatting issues where safe to repair.

**Evidence:** TS port issue shows failure when model returns fenced JSON. See [S8]. LangExtract also reports JSON parsing-related errors. See [S5], [S6].

REQ-9.2.2 — Repair loops MUST be bounded by explicit budgets:

* max repair attempts,
* max tokens,
* max wall-clock per shard.

**Evidence:** Long-doc extraction can take a long time; uncontrolled repair loops can amplify cost/time. See [S7].

---

## 10) Security and safety (engineering, not slogans)

REQ-10.1 — LLM output MUST be treated as **untrusted input**:

* No direct eval
* No shell execution
* No implicit file writes
* No network calls based solely on model output without allowlists

**Evidence:** OWASP Top 10 for LLM Applications lists prompt injection and insecure output handling as major risks. See [S19].

REQ-10.2 — The library MUST provide a “safe interpolation” utility for building prompts (escape delimiters, isolate example blocks) and MUST log the final prompt hash (not the prompt text by default).
**Evidence:** Prompt injection is a known risk; logging hashes supports reproducibility while reducing accidental secret leakage. See [S19], [S28].

REQ-10.3 — Any feature that emits HTML MUST escape text by default.
**Evidence:** Visualization exists in LangExtract; HTML generation introduces injection surface if not escaped. See [S3].

---

## 11) Evaluation and regression discipline

### 11.1 Deterministic tests (non-LLM)

REQ-11.1.1 — Core invariants MUST be covered by unit + property tests:

* Quote/offset invariant
* Shard ID determinism
* Parser fence tolerance
* Model-id opacity
* “No silent failure” classification

**Evidence:** Failures observed in TS port and LangExtract map directly to these invariants. See [S5], [S6], [S8], [S9], [S10].

### 11.2 Variance-aware harness (LLM optional)

REQ-11.2.1 — The repo MUST include an optional “variance harness” that runs:

* multiple seeds / temperatures (when supported),
* multiple prompt variants,
* multiple provider backends,
  and reports variance metrics.

**Evidence:** Variance-aware annotation work shows large result swings from small variations and proposes diagnostics. See [S28].

### 11.3 Long-context regression set

REQ-11.3.1 — The repo MUST include a long-text regression fixture suite (local text files) with expected invariants (not brittle exact outputs).
**Evidence:** Long-context benchmarks show behavior changes with length and retrieval complexity; regression should focus on invariants and measured metrics. See [S24–S26].

---

## 12) Repo workflow constraints (agent-compatible)

REQ-12.1 — All changes MUST land via Pull Requests; direct pushes to main MUST be disallowed by process (branch protection recommended).
**Evidence:** GitHub Flow describes branch + pull request workflow and reviews; PRs enable discussion and review before merge. See [S29].

REQ-12.2 — CI MUST run on `pull_request` events and block merge on failure.
**Evidence:** GitHub Actions supports PR-triggered workflows and required reviews/status checks. See [S29].

REQ-12.3 — The repo MUST contain “orphan prevention” checks:

* Every exported API symbol must be documented.
* Every contract schema must have a TS type and runtime validator.
* Every doc section referencing a file must point to a real path.

**Evidence:** PR review and CI checks are standard methods to catch issues early and keep quality high; this is an extension of PR-based collaboration into spec/code coherence. See [S29].

---

## 13) Licensing

REQ-13.1 — The project MUST include `LICENSE` containing Apache-2.0 text, and a project-specific `NOTICE` file.
**Evidence:** Apache licensing how-to and license text instruct inclusion of license and notice guidance. See [S30].

---

## 14) Minimal file layout (to reduce ambiguity for agents)

REQ-14.1 — The repository MUST follow this layout (or a strictly better one that preserves the same separation):

```
/src
  /core                  # runtime-agnostic (web-API first)
/src/node                # Node-only adapters (fs, CLI)
/src/workers             # Workers adapters (request handlers, constraints)
/src/browser             # optional browser helper (if feasible)
/contracts               # JSON schemas (subset) + versioning
/docs                    # user docs + agent docs (generated from spec)
/tests
  /unit
  /property
  /fixtures
/scripts                 # coherence checks, release checks
```

**Evidence:** Cloudflare Workers runtime constraints motivate explicit Workers adapter separation; Node compatibility flags exist but should not be required by core. See [S15]. The TS port and LangExtract failures show how mixing provider/prompt/parser logic yields silent failures. See [S9], [S8].

---

## 15) Acceptance criteria (what counts as “done”)

AC-15.1 — A complete “Hello extraction” example MUST run on:

* Node Active LTS,
* Deno stable,
* Bun stable,
* Cloudflare Workers (local harness),
  producing an EvidenceBundle and passing invariants.

**Evidence:** Project brief [B1]; runtime docs confirm availability of required web APIs. See [S15], [S16], [S14], [S12].

AC-15.2 — Regression tests MUST cover the failure classes documented in:

* LangExtract issues: overload/503, parse failures, invalid control chars, long-doc performance,
* TS port issues: fenced JSON parse failure, silent empty extraction, model-id rewriting.

**Evidence:** [S4–S10].

AC-15.3 — The published package MUST have `dependencies: {}`.
**Evidence:** Project brief [B1].

---

# Appendix A) Evidence ledger (sources)

[B1] Project brief (this conversation): constraints on runtime deps, target runtimes, agent-first, PR-only workflow.

[S1] PRISMA 2020 statement (systematic review reporting guidance):
[https://www.bmj.com/content/372/bmj.n71](https://www.bmj.com/content/372/bmj.n71)

[S2] google/langextract repository (feature statement):
[https://github.com/google/langextract](https://github.com/google/langextract)

[S3] Google Developers Blog — “Introducing LangExtract” (precise offsets, chunking + parallel + multiple passes):
[https://developers.googleblog.com/introducing-langextract-a-gemini-powered-information-extraction-library/](https://developers.googleblog.com/introducing-langextract-a-gemini-powered-information-extraction-library/)

[S4] LangExtract transient overload and shard failure discussion:
[https://github.com/google/langextract/issues/240](https://github.com/google/langextract/issues/240)
[https://discuss.ai.google.dev/t/failed-to-run-the-langextract-example-503-the-model-is-overloaded-please-try-again-later/98279](https://discuss.ai.google.dev/t/failed-to-run-the-langextract-example-503-the-model-is-overloaded-please-try-again-later/98279)

[S5] LangExtract parse/predictions failure:
[https://github.com/google/langextract/issues/287](https://github.com/google/langextract/issues/287)

[S6] LangExtract invalid control character / JSON decode error:
[https://github.com/google/langextract/issues/116](https://github.com/google/langextract/issues/116)

[S7] LangExtract long-doc performance (multi-pass time):
[https://github.com/google/langextract/issues/188](https://github.com/google/langextract/issues/188)

[S8] TS port parse failure due to fenced JSON:
[https://github.com/kmbro/langextract-typescript/issues/7](https://github.com/kmbro/langextract-typescript/issues/7)

[S9] TS port silent empty extractions:
[https://github.com/kmbro/langextract-typescript/issues/10](https://github.com/kmbro/langextract-typescript/issues/10)

[S10] TS port model-id rewriting bug:
[https://github.com/kmbro/langextract-typescript/issues/5](https://github.com/kmbro/langextract-typescript/issues/5)

[S11] Node.js release lifecycle (Active LTS):
[https://nodejs.org/en/about/previous-releases](https://nodejs.org/en/about/previous-releases)

[S12] Deno stability and releases:
[https://docs.deno.com/runtime/fundamentals/stability_and_releases/](https://docs.deno.com/runtime/fundamentals/stability_and_releases/)

[S13] Deno GitHub releases (stable tags):
[https://github.com/denoland/deno/releases](https://github.com/denoland/deno/releases)

[S14] Bun docs (fetch / web APIs / runtime positioning):
[https://bun.com/docs/runtime/networking/fetch](https://bun.com/docs/runtime/networking/fetch)
[https://bun.com/docs/runtime/web-apis](https://bun.com/docs/runtime/web-apis)
[https://bun.com/](https://bun.com/)

[S15] Cloudflare Workers runtime docs (web standards, nodejs compat, fetch rules, web crypto):
[https://developers.cloudflare.com/workers/runtime-apis/](https://developers.cloudflare.com/workers/runtime-apis/)
[https://developers.cloudflare.com/workers/runtime-apis/web-standards/](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)
[https://developers.cloudflare.com/workers/runtime-apis/fetch/](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
[https://developers.cloudflare.com/workers/runtime-apis/web-crypto/](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
[https://developers.cloudflare.com/workers/runtime-apis/nodejs/](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

[S16] Node.js web APIs (fetch, Web Crypto):
[https://nodejs.org/en/learn/getting-started/fetch](https://nodejs.org/en/learn/getting-started/fetch)
[https://nodejs.org/api/webcrypto.html](https://nodejs.org/api/webcrypto.html)

[S17] MDN (browser standards for Fetch and SubtleCrypto):
[https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
[https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)

[S18] Normative keywords:
[https://datatracker.ietf.org/doc/html/rfc2119](https://datatracker.ietf.org/doc/html/rfc2119)
[https://datatracker.ietf.org/doc/rfc8174/](https://datatracker.ietf.org/doc/rfc8174/)

[S19] OWASP Top 10 for LLM Applications (prompt injection, insecure output handling, etc.):
[https://owasp.org/www-project-top-10-for-large-language-model-applications/](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

[S20] OpenAI Structured Outputs (JSON Schema):
[https://developers.openai.com/docs/guides/structured-outputs](https://developers.openai.com/docs/guides/structured-outputs)
[https://cookbook.openai.com/examples/structured_outputs_intro](https://cookbook.openai.com/examples/structured_outputs_intro)

[S21] Amazon Bedrock Structured Outputs:
[https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-structured-output.html](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-structured-output.html)
[https://aws.amazon.com/blogs/machine-learning/introducing-structured-outputs-in-amazon-bedrock/](https://aws.amazon.com/blogs/machine-learning/introducing-structured-outputs-in-amazon-bedrock/)

[S22] vLLM structured outputs (json / regex / grammar):
[https://docs.vllm.ai/en/latest/features/structured_outputs/](https://docs.vllm.ai/en/latest/features/structured_outputs/)

[S23] JSONSchemaBench / constrained decoding evaluation:
[https://openreview.net/forum?id=FKOaJqKoio](https://openreview.net/forum?id=FKOaJqKoio)

[S24] “Lost in the Middle: How Language Models Use Long Contexts”:
[https://arxiv.org/pdf/2307.03172](https://arxiv.org/pdf/2307.03172)

[S25] LongBench (long context benchmark):
[https://aclanthology.org/2024.acl-long.172/](https://aclanthology.org/2024.acl-long.172/)

[S26] RULER (long-context evaluation):
[https://arxiv.org/html/2404.06654v3](https://arxiv.org/html/2404.06654v3)

[S27] Anthropic — Building effective agents (context + decomposition patterns):
[https://www.anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents)

[S28] Variance-aware LLM annotation protocol (prompt/model/procedure variance):
[https://arxiv.org/html/2601.02370v3](https://arxiv.org/html/2601.02370v3)

[S29] GitHub collaboration + CI workflow docs (PRs, reviews, matrix):
[https://docs.github.com/en/get-started/using-github/github-flow](https://docs.github.com/en/get-started/using-github/github-flow)
[https://docs.github.com/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests](https://docs.github.com/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests)
[https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow)

[S30] Apache licensing guidance (LICENSE + NOTICE):
[https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0)
[https://www.apache.org/dev/licensing-howto.html](https://www.apache.org/dev/licensing-howto.html)
