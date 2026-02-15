# Portability

## Node example
```bash
node examples/node/basic.ts
```

## Deno example
```bash
deno run examples/deno/basic.ts
```

## Bun example
```bash
bun run examples/bun/basic.ts
```

## Browser example (local)
```bash
npm run build
deno serve --allow-read --allow-net --port 8080
```
Then open:
- `http://localhost:8080/examples/browser/index.html`

## Workers example (local)
Use the worker module in `examples/workers/worker.ts` with your preferred worker tooling (Wrangler/Miniflare).

A minimal `wrangler.toml` entrypoint would point to:
- `main = "examples/workers/worker.ts"`

## Workers harness test
Run the local Workers compatibility harness with:
```bash
npm run test:workers
```
This uses Miniflare to dispatch a request against `examples/workers/worker.ts`.

## Browser harness test
Run browser compatibility bundling check with:
```bash
npm run test:browser
```
This builds `dist/` and bundles `examples/browser/app.ts` for browser platform with Deno.

## Expected output
Each runtime should emit a single extraction for `"Beta"` with span `[6, 10)`.
