# OSS Practices Checks

This document defines operational checks used to keep the repository forkable, reproducible, and publishable.

## Verifiable Controls
| Control | Requirement | Verification |
| --- | --- | --- |
| OSS operations documents exist | `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SUPPORT.md`, `CHANGELOG.md`, `RELEASE.md` must exist | `npm run oss-check` |
| Runtime dependencies blocked | `package.json.dependencies` must remain `{}` | `npm run oss-check` |
| Dev dependency debt ledger | Every `devDependency` must be listed in `docs/DEVDEPS.md` with explicit debt rationale | `npm run oss-check` |
| OSS check enforced in default validation | `npm run check` must execute `npm run oss-check` | `npm run oss-check` |
| Repository scope enforcement | Disallowed internal-only path roots must not exist in this repository | `npm run repo-scope-check` |
| Repo text policy enforcement | Forbidden path patterns, placeholder tokens, and identifier grammar must fail validation | `npm run repo-text-check` |
| CI least-privilege permissions | CI workflow must set explicit minimum permissions (`contents: read`) | `npm run oss-check` |
| CI action pinning | Every workflow `uses:` step must be pinned to a full commit SHA | `npm run oss-check` |
| Dependabot churn control | Dependabot config must exist and every ecosystem must set `open-pull-requests-limit: 0` | `npm run oss-check` |
| API/docs/contracts coherence | Export paths and contract files must be referenced and examples must run | `npm run orphan-check` |
| Cross-runtime regression matrix | Node, Deno, Bun, Workers tests must pass | CI jobs `node`, `deno`, `bun`, `workers` |
| Browser compatibility harness | Browser example must bundle against published distribution output | `npm run test:browser` and CI job `browser` |
| Bench evidence harness | Deterministic benchmark run and score must execute in CI | `npm run bench` and CI job `bench` |
| Long-text regression coverage | Deterministic long-text fixture tests must run in default test suite and bench dataset | `npm test` and `npm run bench` |
| PR-only integration workflow | CI must run on pull requests and gate merges | `.github/workflows/ci.yml` + branch policy |
| PR body template presence | Repository PR template must exist and be used for standardized verification/evidence sections | `npm run oss-check` |
| PR body heading enforcement | CI node job must execute `node scripts/pr-body-check.ts` and fail on missing template headings in pull request bodies | CI `node` job and `npm run oss-check` |
| Requirement evidence mapping | Every `REQ-*` in `MASTER_SPEC.md` must map to code/tests/CI or explicit gap rationale | `SPEC_TRACEABILITY.md` review in PR |
| Baseline reproducibility snapshot | Baseline command matrix and environment notes tracked | `docs/BASELINE_AUDIT.md` |

## Rule For Claims
Any performance or quality claim in README/docs must link to reproducible bench evidence under `bench/results/`.
