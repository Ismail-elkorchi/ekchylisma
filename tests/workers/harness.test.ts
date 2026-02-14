import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { Miniflare } from "miniflare";
import { assert, assertEqual, run, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const bundleDir = "tests/workers/.tmp";
const bundlePath = `${bundleDir}/worker.bundle.mjs`;

test("workers harness executes example worker and returns portability payload", async () => {
  await mkdir(bundleDir, { recursive: true });
  await execFileAsync("deno", [
    "bundle",
    "examples/workers/worker.ts",
    "-o",
    bundlePath,
  ]);

  const mf = new Miniflare({
    modules: true,
    scriptPath: bundlePath,
    compatibilityDate: "2026-01-01",
  });

  try {
    const response = await mf.dispatchFetch("http://localhost/");
    assertEqual(response.status, 200);
    assertEqual(response.headers.get("content-type"), "application/json; charset=utf-8");

    const payload = await response.json() as {
      runtime: string;
      extractionCount: number;
      extractions: Array<{ quote?: string }>;
    };

    assertEqual(payload.runtime, "workers");
    assertEqual(payload.extractionCount, 1);
    assert(Array.isArray(payload.extractions), "extractions should be an array");
    assertEqual(payload.extractions[0]?.quote, "Beta");
  } finally {
    await mf.dispose();
    await rm(bundleDir, { recursive: true, force: true });
  }
});

await run();
