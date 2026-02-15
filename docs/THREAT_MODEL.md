# Threat Model

## Scope
ekchylisma processes untrusted document text and untrusted model output to produce structured, grounded extraction results.

## Assumptions
- Provider responses may contain malformed JSON, extra prose, or refusal text.
- Document text may contain prompt-injection patterns and control characters.
- Integrations may run in Node, Deno, Bun, Workers, and browser environments.
- Integrations may use outputs in downstream systems with stricter integrity requirements.

## Non-goals
- This library does not execute external tools based on model output.
- This library does not provide authentication, authorization, or key management.
- This library does not guarantee semantic correctness of model-generated attributes.

## Output Handling Contract
Treat all model output as untrusted until the following checks pass:
1. Parse via bounded pipeline (`extractFirstJson -> repairJsonText -> parseJsonStrict`).
2. Enforce extraction payload shape contract.
3. Enforce quote invariant (`document.slice(charStart, charEnd) === quote`) for accepted extractions.
4. Classify run outcome as `non_empty`, `empty_by_evidence`, or `empty_by_failure`.

Integrations should reject or quarantine results when any step fails.

## OWASP LLM Risk Mapping
- `LLM01 Prompt Injection`
  - Mitigation: trusted/untrusted prompt boundaries and deterministic prompt compiler format.
- `LLM02 Insecure Output Handling`
  - Mitigation: bounded JSON pipeline, explicit parse failures, payload-shape checks, quote invariant.
- `LLM04 Model Denial of Service`
  - Mitigation: bounded repair steps, shard-level retries, and checkpointed execution.
- `LLM05 Supply Chain Vulnerabilities`
  - Mitigation: zero runtime dependencies and pinned CI actions.
- `LLM06 Sensitive Information Disclosure`
  - Mitigation: provider credentials are caller-supplied; no implicit environment-variable reads in adapters.
- `LLM08 Excessive Agency`
  - Mitigation: model output is data-only; library does not execute model-generated commands.
- `LLM09 Overreliance`
  - Mitigation: deterministic tests, evidence bundles, and explicit failure classification.

## Prompt Boundary Controls
- Trusted instructions and schema appear before document content.
- Document text is wrapped with `BEGIN_UNTRUSTED_DOCUMENT` and `END_UNTRUSTED_DOCUMENT`.
- Prompt compiler output is deterministic and test-covered.
