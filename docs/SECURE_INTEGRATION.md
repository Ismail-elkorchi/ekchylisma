# Secure Integration Guide

## Integration Goal
Use extraction outputs as validated data artifacts, not as executable instructions.

## Do
- Run `runWithEvidence()` and persist `EvidenceBundle` for auditability.
- Gate downstream processing on:
  - successful parse/payload checks
  - quote invariant compliance
  - acceptable `diagnostics.emptyResultKind`
- Require explicit allowlists before any downstream action is triggered.
- Separate extraction runtime credentials from action-execution credentials.
- Log run identifiers and shard failures for incident analysis.

## Do Not
- Do not execute shell commands, SQL, HTTP requests, or filesystem writes directly from model-generated attributes.
- Do not treat `empty_by_failure` as a valid “no entities present” result.
- Do not bypass quote invariant checks when mapping spans to source text.
- Do not expose provider credentials through prompt text, error messages, or browser output.

## Recommended Runtime Controls
- Enforce per-request timeout budgets and retry limits.
- Restrict outbound network destinations in action layers outside this library.
- Keep CI and release paths deterministic (`npm run check` + runtime matrix tests).
- Require PR review for dependency and workflow changes.
