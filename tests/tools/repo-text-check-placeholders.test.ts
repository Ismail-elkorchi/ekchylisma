import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "repo-text-check.ts");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-repo-text-check");
const PLACEHOLDER_TOKEN = ["TO", "DO"].join("");

test("repo-text-check fails when placeholder tokens are present", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "bench", "datasets"), { recursive: true });

  const minimalRegressionRecord = {
    caseId: "placeholder-check--fake-provider--1--1a2b3c4d",
    packId: "2026-02-15--placeholder-check--1a2b3c4d",
  };
  await writeFile(
    join(TEMP_DIR, "bench", "datasets", "regression.jsonl"),
    `${JSON.stringify(minimalRegressionRecord)}\n`,
    "utf8",
  );
  await writeFile(
    join(TEMP_DIR, "README.md"),
    `${PLACEHOLDER_TOKEN} replace this text\n`,
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
      output.includes("contains forbidden placeholder token");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "repo-text-check should fail on placeholder marker tokens",
  );
});
