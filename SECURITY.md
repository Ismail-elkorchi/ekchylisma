# Security Policy

## What Is a Security Issue
Report issues that can cause confidentiality, integrity, or availability impact in systems using this library, including:
- prompt/output handling defects that can bypass validation or invariants
- unsafe defaults that enable unintended network/file/action execution paths
- integrity failures in evidence, checkpoints, or attestation surfaces
- dependency or build pipeline compromise affecting published artifacts

Incorrect extraction quality without a security boundary impact should be filed as a regular bug.

## Private Reporting
Use GitHub Security Advisories for private disclosure:
- `Security` tab -> `Report a vulnerability`

If Security Advisories are unavailable in your context, open a private maintainer contact request in an issue with title prefix `SECURITY-CONTACT` and no exploit details. A private channel will be provided.

## Disclosure Process
- Maintainers acknowledge receipt within 5 business days.
- Maintainers provide an initial triage decision within 10 business days.
- A fix target and disclosure window are agreed after triage.
- Public disclosure occurs after a fix is available or a mitigated timeline is explicitly documented.

## Safe Harbor Statement
Good-faith security research following this policy is permitted. Do not access or modify data you do not own, and do not perform denial-of-service activity. If an action may affect service availability or data integrity, stop and request maintainer coordination first.
