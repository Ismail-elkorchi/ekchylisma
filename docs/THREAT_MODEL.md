# Threat Model

## Scope

ekchylisma processes untrusted document text and untrusted model output to
produce structured, grounded extraction results. Security boundaries are
enforced in parsing, invariant checks, and prompt construction layers.

## Assumptions

- Provider responses may include malformed JSON, fence/prose wrappers, and
  control characters.
- Document text may contain prompt-injection strings, delimiter tokens, and
  hostile instruction text.
- Integrations run across Node, Deno, Bun, Workers, and browser contexts.
- Downstream systems may execute sensitive actions and must not trust extraction
  payloads by default.

## Non-goals

- The library does not execute tools, shell commands, SQL, HTTP actions, or
  filesystem writes from model output.
- The library does not provide authn/authz, key vaulting, or network policy
  enforcement.
- The library does not guarantee semantic correctness of inferred attributes.

## Untrusted Output Contract

Treat model output as untrusted until all checks pass:

1. Parse via bounded pipeline
   (`extractFirstJson -> repairJsonText -> parseJsonStrict`).
2. Enforce extraction payload shape and offset-mode constraints.
3. Enforce quote invariant (`document.slice(charStart, charEnd) === quote`).
4. Classify outcome (`non_empty`, `empty_by_evidence`, `empty_by_failure`) with
   explicit failure logs.

Any failure path should be considered data rejection, not a soft warning.

## Attack Classes And Controls

- Prompt injection boundaries
  - Control: prompt compiler isolates untrusted text in
    `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT` and neutralizes
    boundary-token injection in untrusted sections.
  - Control: repair prompts neutralize injected `PREVIOUS_RESPONSE_TEXT_BEGIN` /
    `PREVIOUS_RESPONSE_TEXT_END` markers in prior-response text.
  - Tests: `tests/engine/security-hardening.test.ts` (`compilePrompt`,
    `compileRepairPrompt` security cases).
- Schema confusion
  - Control: schema dialect normalization rejects unsupported keywords and
    provider payload-shape mismatches fail deterministically.
  - Tests: `tests/engine/security-hardening.test.ts` schema-confusion case and
    `tests/regression/threat-model-hardening.test.ts` pack cases.
- Quote spoofing
  - Control: quote invariant validation blocks mismatched offsets/quotes and
    unsupported offset modes.
  - Tests: `tests/engine/security-hardening.test.ts` quote-spoofing cases and
    `tests/regression/threat-model-hardening.test.ts` pack cases.

## OWASP LLM Risk Mapping

- `LLM01 Prompt Injection`
  - Mitigation: explicit trusted/untrusted prompt boundaries and marker
    neutralization.
- `LLM02 Insecure Output Handling`
  - Mitigation: bounded parse/repair pipeline, payload-shape checks, quote
    invariant enforcement.
- `LLM04 Model Denial of Service`
  - Mitigation: bounded repair budgets, retries, shard-level checkpoints.
- `LLM05 Supply Chain Vulnerabilities`
  - Mitigation: zero runtime dependencies and pinned CI actions.
- `LLM06 Sensitive Information Disclosure`
  - Mitigation: provider credentials are caller-supplied; adapters do not read
    secrets implicitly.
- `LLM08 Excessive Agency`
  - Mitigation: output is treated as inert data only.
- `LLM09 Overreliance`
  - Mitigation: deterministic tests, evidence bundles, and explicit failure
    classification.

## Verification Workflow

Run:

- `npm test`
- `npm run bench`

These commands execute threat-model hardening tests and regression packs in
deterministic fake-provider mode.
