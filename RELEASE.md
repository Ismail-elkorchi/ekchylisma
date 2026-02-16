# Release Process

## Versioning Policy

- Semantic Versioning is used (`MAJOR.MINOR.PATCH`).
- Breaking API/contract changes increment `MAJOR`.
- Backward-compatible features increment `MINOR`.
- Backward-compatible fixes increment `PATCH`.

## Breaking Change Criteria

Any of the following is treated as breaking:

- removing or renaming a public export
- changing a public type/contract field incompatibly
- changing default behavior in a way that invalidates existing integrations
- changing schema compatibility for contract files in `contracts/`

## Release Steps

1. Ensure `main` is green and no open release-blocking issues remain.
2. Update `CHANGELOG.md`:
   - move relevant entries from `Unreleased` into a version section
   - include release date
3. Run release verification locally:
   - `npm run check`
   - `npm run test:deno`
   - `npm run test:bun`
   - `npm run test:workers`
4. Create release commit and tag:
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
5. Push tag and create GitHub release notes tied to changelog entries.
6. Validate generated package artifacts before publication (when publishing is
   enabled).
