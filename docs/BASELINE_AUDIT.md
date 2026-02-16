# Baseline Audit

Timestamp: `2026-02-15T01:50:52+01:00`

## Environment

- `node`: `v25.2.1`
- `npm`: `11.6.2`
- `deno`: `2.6.7`
- `bun`: `1.3.8`
- `git`: `2.51.0`
- `gh`: `2.86.0`

## Command Results

| Command                | Result | Notes                                                         |
| ---------------------- | ------ | ------------------------------------------------------------- |
| `npm run check`        | PASS   | Runs `npm test`, `npm run typecheck`, `npm run orphan-check`. |
| `npm run test:deno`    | PASS   | Full test suite executed under Deno stable.                   |
| `npm run test:bun`     | PASS   | Full test suite executed under Bun stable.                    |
| `npm run test:workers` | PASS   | Workers harness test executed via Miniflare.                  |

## Observations

- Baseline command matrix is green before additional changes.
- Repository remains cross-runtime executable for Node, Deno, Bun, and Workers.
