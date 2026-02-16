import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assert, test } from "../harness.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "pr-body-check.ts");
const TEMPLATE_PATH = join(REPO_ROOT, ".github", "PULL_REQUEST_TEMPLATE.md");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-pr-check-title");
const TITLE_TOKEN = ["PR", "-11"].join("");

function headingsToBody(template: string): string {
  const headings = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "));

  return headings.map((heading) => `${heading}\ncontent`).join("\n\n");
}

test("pr-body-check rejects forbidden PR title tokens", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const template = await readFile(TEMPLATE_PATH, "utf8");
  const payloadPath = join(TEMP_DIR, "event.json");
  await writeFile(
    payloadPath,
    JSON.stringify({
      pull_request: {
        number: 101,
        title: `feat(core): ${TITLE_TOKEN} noncompliant title`,
        body: headingsToBody(template),
        head: {
          ref: "ci/valid-branch-name",
        },
      },
    }),
    "utf8",
  );

  let failedAsExpected = false;
  try {
    await execFileAsync("node", [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: payloadPath,
      },
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
      output.includes("PR title contains a forbidden token pattern.");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "pr-body-check should reject forbidden PR title token patterns",
  );
});
