# Secure Integration Guide

## Integration Goal

Use extraction outputs as validated data artifacts, never as executable
instructions.

## Required Gates Before Any Downstream Action

1. Run `runWithEvidence()` and persist the returned `EvidenceBundle`.
2. Require `diagnostics.emptyResultKind !== "empty_by_failure"`.
3. Require invariant-safe extractions (quote/offset checks pass).
4. Apply explicit allowlists in downstream action layers (outside this library).

## Attack-Class Integration Checklist

- Prompt injection boundaries
  - Treat all document text as untrusted data.
  - Do not concatenate raw user text into trusted prompt blocks outside
    `compilePrompt` / `compileRepairPrompt`.
- Schema confusion
  - Reject schemas with unsupported dialect keywords.
  - Reject payloads that do not match extraction shape requirements.
- Quote spoofing
  - Reject extractions when quote/offset invariant fails.
  - Never bypass invariant checks for convenience mapping.

## Do

- Separate extraction credentials from action-execution credentials.
- Store run IDs and shard failures for incident forensics.
- Enforce timeout, retry, and repair budgets.
- Restrict outbound network destinations in systems that consume extraction
  results.
- Run `npm run check` and `npm run bench` before deployment changes.

## Do Not

- Do not execute shell commands, SQL, HTTP requests, or filesystem writes
  directly from model output.
- Do not treat `empty_by_failure` as “no entities found.”
- Do not trust provider text before parse + payload + invariant checks.
- Do not expose secrets in prompts, browser bundles, or error logs.

## Recommended Minimal Policy

- `empty_by_failure`: reject and quarantine.
- `empty_by_evidence`: treat as valid empty result.
- `non_empty`: accept only after invariant-safe extraction checks.

## Runtime Notes

This library enforces data-shape and invariant boundaries. It does not enforce
org-specific policy controls (RBAC, outbound firewall, key rotation, DLP), which
must be implemented by the integrating system.
