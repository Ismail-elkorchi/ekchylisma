import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);

function shouldSkipInNonNodeRuntime(): boolean {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  return runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined;
}

test("bench score fails when case-outcome drift exceeds threshold", async () => {
  if (shouldSkipInNonNodeRuntime()) {
    return;
  }

  const tempDir = join("tests", ".tmp-bench-score-fail");
  await mkdir(tempDir, { recursive: true });
  const resultPath = join(tempDir, "result.json");

  const result = {
    aggregate: {
      successRate: 1,
      schemaValidityRate: 1,
      quoteInvariantPassRate: 1,
      coverageRate: 1,
      extractionCountVariance: 0.01,
      successRateStdDev: 0.01,
      caseOutcomeDriftRate: 0.4,
      breadth: {
        smokeCaseCount: 3,
        regressionCaseCount: 8,
        totalCaseCount: 11,
        regressionCategoryCount: 2,
      },
    },
  };

  await writeFile(resultPath, `${JSON.stringify(result)}\n`, "utf8");

  let failedAsExpected = false;
  try {
    await execFileAsync(
      "node",
      [
        "bench/score.ts",
        "--result",
        resultPath,
        "--max-case-outcome-drift-rate",
        "0.1",
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    const detail = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const combined = `${detail.stdout ?? ""}\n${detail.stderr ?? ""}\n${
      detail.message ?? ""
    }`;
    failedAsExpected = typeof detail.code === "number" &&
      detail.code !== 0 &&
      combined.includes("caseOutcomeDriftRate above threshold");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "expected bench score to fail when drift exceeds ceiling",
  );
});

test("bench score passes with bounded variance and sufficient breadth", async () => {
  if (shouldSkipInNonNodeRuntime()) {
    return;
  }

  const tempDir = join("tests", ".tmp-bench-score-pass");
  await mkdir(tempDir, { recursive: true });
  const resultPath = join(tempDir, "result.json");

  const result = {
    aggregate: {
      successRate: 1,
      schemaValidityRate: 1,
      quoteInvariantPassRate: 1,
      coverageRate: 1,
      extractionCountVariance: 0,
      successRateStdDev: 0,
      caseOutcomeDriftRate: 0,
      breadth: {
        smokeCaseCount: 3,
        regressionCaseCount: 16,
        totalCaseCount: 19,
        regressionCategoryCount: 4,
      },
    },
  };

  await writeFile(resultPath, `${JSON.stringify(result)}\n`, "utf8");

  const execution = await execFileAsync(
    "node",
    [
      "bench/score.ts",
      "--result",
      resultPath,
      "--max-case-outcome-drift-rate",
      "0.1",
      "--min-regression-category-count",
      "2",
    ],
    { encoding: "utf8" },
  );

  await rm(tempDir, { recursive: true, force: true });
  assert(
    execution.stdout.includes("bench score passed"),
    "bench score should pass with bounded variance",
  );
});
