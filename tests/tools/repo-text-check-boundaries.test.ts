import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "repo-text-check.ts");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-repo-text-check-boundaries");
const FORBIDDEN_MARKER = ["competition", "scan"].join(" ");

function minimalRegressionRecord() {
  return {
    caseId: "repo-text-boundary-check--fake-provider--1--1a2b3c4d",
    packId: "2026-02-16--repo-text-boundary-check--1a2b3c4d",
  };
}

test("repo-text-check fails when forbidden docs signal path is present", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "bench", "datasets"), { recursive: true });
  await mkdir(join(TEMP_DIR, "docs"), { recursive: true });

  await writeFile(
    join(TEMP_DIR, "bench", "datasets", "regression.jsonl"),
    `${JSON.stringify(minimalRegressionRecord())}\n`,
    "utf8",
  );
  await writeFile(
    join(TEMP_DIR, "docs", "SIGNAL_INDEX.md"),
    "signal boundary fixture\n",
    "utf8",
  );

  let failedAsExpected = false;
  try {
    await execFileAsync("node", [SCRIPT_PATH], {
      cwd: TEMP_DIR,
      encoding: "utf8",
    });
  } catch (error) {
    const details = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const output = [
      details.stderr ?? "",
      details.stdout ?? "",
      details.message ?? "",
    ].join("\n");
    failedAsExpected = typeof details.code === "number" &&
      details.code !== 0 &&
      output.includes("forbidden path matches policy");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "repo-text-check should fail on forbidden docs signal path",
  );
});

test("repo-text-check fails when forbidden marker appears in first 200 lines", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "bench", "datasets"), { recursive: true });

  await writeFile(
    join(TEMP_DIR, "bench", "datasets", "regression.jsonl"),
    `${JSON.stringify(minimalRegressionRecord())}\n`,
    "utf8",
  );
  await writeFile(join(TEMP_DIR, "README.md"), `${FORBIDDEN_MARKER}\n`, "utf8");

  let failedAsExpected = false;
  try {
    await execFileAsync("node", [SCRIPT_PATH], {
      cwd: TEMP_DIR,
      encoding: "utf8",
    });
  } catch (error) {
    const details = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const output = [
      details.stderr ?? "",
      details.stdout ?? "",
      details.message ?? "",
    ].join("\n");
    failedAsExpected = typeof details.code === "number" &&
      details.code !== 0 &&
      output.includes("forbidden marker phrase");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "repo-text-check should fail on forbidden marker phrase",
  );
});
