import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH = join(
  REPO_ROOT,
  "tests",
  "fixtures",
  "minified-example.ts",
);
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-format-gate");

test("minified formatter fixture remains a single-line file", async () => {
  const fixture = await readFile(FIXTURE_PATH, "utf8");
  const nonEmptyLines = fixture.split(/\r?\n/).filter((line) =>
    line.trim().length > 0
  );
  assert(
    nonEmptyLines.length === 1,
    "fixture must remain single-line to exercise formatter failure",
  );
  assert(
    nonEmptyLines[0].length > 80,
    "fixture line must be long enough to resemble minified source",
  );
});

test("fmt:check fails against the minified fixture in an isolated temp copy", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "tests", "fixtures"), { recursive: true });
  await copyFile(
    FIXTURE_PATH,
    join(TEMP_DIR, "tests", "fixtures", "minified-example.ts"),
  );
  await writeFile(
    join(TEMP_DIR, "package.json"),
    JSON.stringify(
      {
        name: "format-gate-fixture",
        private: true,
        type: "module",
        scripts: {
          "fmt:check": "deno fmt --check",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  let failedAsExpected = false;
  try {
    await execFileAsync("npm", ["run", "fmt:check"], {
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
      output.includes("not formatted file");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "fmt:check should fail on the minified fixture in an isolated copy",
  );
});
