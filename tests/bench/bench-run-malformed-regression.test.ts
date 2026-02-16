import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);

test("bench runner exits non-zero on malformed regression record", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  const tempDir = join("tests", ".tmp-bench-malformed");
  await mkdir(tempDir, { recursive: true });
  const regressionPath = join(tempDir, "malformed-regression.jsonl");
  const outputPath = join(tempDir, "result.json");

  const malformedRecord = {
    caseId: "malformed-1",
    category: "json-parse",
    documentText: "Alpha Beta",
    instructions: "Extract token Beta.",
    targetSchema: { type: "object" },
    providerResponseText: '{"extractions":[]}',
    expected: {
      emptyResultKind: "empty_by_evidence",
      minExtractions: 0,
      maxExtractions: 0,
    },
    sourceUrl: "https://example.com/source",
  };

  await writeFile(
    regressionPath,
    `${JSON.stringify(malformedRecord)}\n`,
    "utf8",
  );

  let failedAsExpected = false;

  try {
    await execFileAsync(
      "node",
      [
        "bench/run.ts",
        "--smoke-dataset",
        "bench/datasets/smoke.jsonl",
        "--regression-dataset",
        regressionPath,
        "--out",
        outputPath,
      ],
      {
        encoding: "utf8",
      },
    );
  } catch (error) {
    const details = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const output = [
      typeof details.stderr === "string" ? details.stderr : "",
      typeof details.stdout === "string" ? details.stdout : "",
      typeof details.message === "string" ? details.message : "",
    ].join("\n");
    failedAsExpected = typeof details.code === "number" &&
      details.code !== 0 &&
      output.includes("invalid regression dataset");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "bench runner should fail with invalid regression dataset error",
  );
});
