# Governance

## Decision Process
- Architecture and policy decisions are recorded as ADRs in `docs/DECISIONS.md`.
- PRs implementing ADR-impacting changes must reference the ADR entry.
- `MASTER_SPEC.md` is the contract of record for normative requirements.

## Maintainers
Maintainers are responsible for:
- triage of issues and security reports
- review/merge decisions
- release and changelog updates
- coherence across code, contracts, tests, and docs

## Adding Maintainers
New maintainers are added by an existing maintainer through a PR documenting:
- scope of responsibility
- repository permissions needed
- onboarding verification checklist

## Fork Policy
Forks are explicitly welcome.

For long-lived forks:
1. Keep your own ADR log for fork-specific policy changes.
2. Track upstream changes with periodic merges or rebases.
3. Preserve requirement traceability (maintain a fork-local `SPEC_TRACEABILITY.md`).
4. Document divergence points in your fork README.
