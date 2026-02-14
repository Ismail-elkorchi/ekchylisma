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
