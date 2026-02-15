# Contributing

## Workflow
- Open an issue first for non-trivial changes.
- Use small, narrow PRs with clear scope and verification output.
- Keep contracts, docs, tests, and code coherent in the same PR.
- Update `SPEC_TRACEABILITY.md` whenever requirement evidence changes.
- Use squash merge.

## Local Development
Run the full matrix before opening or updating a PR:

```bash
npm run check
npm run test:deno
npm run test:bun
npm run test:workers
```

## Contribution License Terms
No CLA is required.

By contributing, you agree that your contribution is licensed under the repository license (`Apache-2.0`) and you assert you have the right to submit it.

Recommended commit format includes sign-off:
- `git commit -s ...`

## Adding a Dev Dependency
Dev dependencies are allowed only when required by a repository requirement or ADR.

Required updates in the same PR:
1. Add the dependency to `package.json` under `devDependencies`.
2. Add an explicit debt entry in `docs/DEVDEPS.md` (`package`, `version`, `debt it pays`).
3. Add/extend an ADR entry in `docs/DECISIONS.md` if policy or tooling changes.
4. Show verification commands in the PR body and ensure CI is green.

Runtime dependencies are not allowed. `package.json.dependencies` must remain `{}`.
