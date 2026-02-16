import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "unicode-and-linebreak-check.ts");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-unicode-check-bidi");

test("unicode check fails on bidi control characters with codepoint and byte offset", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "tests"), { recursive: true });
  await writeFile(join(TEMP_DIR, "tests", "fixture.ts"), "\u202E\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: TEMP_DIR, encoding: "utf8" });
  await execFileAsync("git", ["add", "tests/fixture.ts"], {
    cwd: TEMP_DIR,
    encoding: "utf8",
  });

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
      output.includes("tests/fixture.ts") &&
      output.includes("U+202E") &&
      output.includes("byte offset 0");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "unicode check should report bidi control codepoint and byte offset",
  );
});
