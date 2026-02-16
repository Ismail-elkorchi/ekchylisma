# Release Procedure

## Tag Format

Create and push a tag in the form `v*.*.*` (for example, `v1.2.3`).

## Automated Workflow

Pushing a matching tag triggers `.github/workflows/release.yml`, which runs:

1. `actions/checkout` (pinned SHA)
2. `actions/setup-node` (pinned SHA, `node-version: lts/*`)
3. `npm ci`
4. `npm run build`
5. `npm pack`
6. `actions/upload-artifact` (pinned SHA)

## Uploaded Artifacts

The release workflow uploads one artifact bundle named `release-artifacts-<tag>`
containing:

- npm pack tarball produced in the run
- `dist/`
- `contracts/`
- `docs/RELEASE.md` snapshot
