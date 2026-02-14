# Threat Model

## Scope
This project treats all model outputs and document content as untrusted data.

## OWASP LLM Risk Mapping
- `LLM01 Prompt Injection`
  - Mitigation: prompt compiler uses explicit trusted/untrusted boundaries and labels.
- `LLM02 Insecure Output Handling`
  - Mitigation: JSON parse + validation + quote invariant checks before accepting extractions.
- `LLM03 Training Data Poisoning`
  - Mitigation: provider outputs are audited through evidence bundles and repair logs.
- `LLM04 Model Denial of Service`
  - Mitigation: bounded retry policy, bounded repair transforms, and chunking controls.
- `LLM05 Supply Chain Vulnerabilities`
  - Mitigation: zero runtime dependencies in core package.
- `LLM06 Sensitive Information Disclosure`
  - Mitigation: provider config is explicit; no implicit env reads in core/provider code.
- `LLM07 Insecure Plugin Design`
  - Mitigation: provider adapters are thin fetch wrappers with typed interfaces.
- `LLM08 Excessive Agency`
  - Mitigation: document text is marked as untrusted data and not treated as instructions.
- `LLM09 Overreliance`
  - Mitigation: quote invariant and deterministic tests guard against silent hallucinated spans.
- `LLM10 Model Theft`
  - Mitigation: keep adapter surface minimal and avoid proxying privileged credentials in logs.

## Prompt Boundary Controls
- Trusted instructions and schema are emitted ahead of document content.
- `UNTRUSTED DOCUMENT` is explicitly labeled.
- Document content is wrapped by `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT` markers.
- Compiler output format is deterministic and test-covered.
