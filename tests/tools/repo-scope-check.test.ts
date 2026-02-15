import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "repo-scope-check.ts");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-repo-scope-check");

test("repo-scope-check fails when forbidden paths are present", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "internal"), { recursive: true });

  let failedAsExpected = false;
  try {
    await execFileAsync("node", [SCRIPT_PATH], { cwd: TEMP_DIR, encoding: "utf8" });
  } catch (error) {
    const details = error as { code?: number; stderr?: string; stdout?: string; message?: string };
    const output = [details.stderr ?? "", details.stdout ?? "", details.message ?? ""].join("\n");
    failedAsExpected = typeof details.code === "number"
      && details.code !== 0
      && output.includes("repo-scope-check failed");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(failedAsExpected, "repo-scope-check should fail on forbidden paths");
});
