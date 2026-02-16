import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  containsPlaceholderToken,
  isValidCaseId,
  isValidPackId,
} from "../src/core/identifiers.ts";

const WORKFLOW_DIR_TOKEN = ["WORK", "BENCH"].join("");

const FORBIDDEN_DOC_PATTERNS = [
  /^docs\/PROGRAM_.*\.md$/,
  /^docs\/COMPETITION_.*\.md$/,
  /^docs\/.*SIGNAL.*\.md$/,
  /^docs\/.*PLAN.*\.md$/,
  /^docs\/.*MATRIX.*\.md$/,
  new RegExp(`^docs\\/.*${WORKFLOW_DIR_TOKEN}.*\\.md$`),
];

const FORBIDDEN_ROOT_PATHS = [WORKFLOW_DIR_TOKEN];
const FORBIDDEN_HEADER_TERMS = ["competition", "scan"];
const FORBIDDEN_HEADER_PATTERN = new RegExp(
  FORBIDDEN_HEADER_TERMS.join("\\s+"),
  "i",
);

const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
const execFileAsync = promisify(execFile);

const UNICODE_FORMAT_CONTROL_NAMES = new Map<number, string>([
  [0x00AD, "SOFT HYPHEN"],
  [0x061C, "ARABIC LETTER MARK"],
  [0x200B, "ZERO WIDTH SPACE"],
  [0x200C, "ZERO WIDTH NON-JOINER"],
  [0x200D, "ZERO WIDTH JOINER"],
  [0x200E, "LEFT-TO-RIGHT MARK"],
  [0x200F, "RIGHT-TO-LEFT MARK"],
  [0x202A, "LEFT-TO-RIGHT EMBEDDING"],
  [0x202B, "RIGHT-TO-LEFT EMBEDDING"],
  [0x202C, "POP DIRECTIONAL FORMATTING"],
  [0x202D, "LEFT-TO-RIGHT OVERRIDE"],
  [0x202E, "RIGHT-TO-LEFT OVERRIDE"],
  [0x2060, "WORD JOINER"],
  [0x2066, "LEFT-TO-RIGHT ISOLATE"],
  [0x2067, "RIGHT-TO-LEFT ISOLATE"],
  [0x2068, "FIRST STRONG ISOLATE"],
  [0x2069, "POP DIRECTIONAL ISOLATE"],
  [0xFEFF, "ZERO WIDTH NO-BREAK SPACE"],
]);

function fail(message: string): never {
  throw new Error(message);
}

export function eval_hasUnicodeFormatControl(text: string): boolean {
  return /\p{Cf}/u.test(text);
}

function eval_findFirstUnicodeFormatControl(text: string):
  | {
    character: string;
    codePoint: number;
  }
  | null {
  const match = /\p{Cf}/u.exec(text);
  if (match === null || match[0].length === 0) {
    return null;
  }
  return {
    character: match[0],
    codePoint: match[0].codePointAt(0) ?? 0,
  };
}

function formatCodePoint(value: number): string {
  return `U+${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function getUnicodeFormatControlName(codePoint: number): string {
  return UNICODE_FORMAT_CONTROL_NAMES.get(codePoint) ??
    "Unicode name unavailable";
}

async function walkFiles(root: string): Promise<string[]> {
  const output: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relativePath = fullPath.replace(/^\.\//, "");

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(relativePath.split("/").at(-1) ?? "")) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      output.push(relativePath);
    }
  }

  await walk(root);
  return output;
}

async function act_listTrackedFiles(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
      encoding: "utf8",
    });
    return stdout
      .split("\0")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch {
    // Some tests execute in temporary directories outside a git worktree.
    return await walkFiles(".");
  }
}

export async function act_scanRepoForUnicodeFormatControls(): Promise<void> {
  const files = await act_listTrackedFiles();
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    if (!eval_hasUnicodeFormatControl(content)) {
      continue;
    }

    const first = eval_findFirstUnicodeFormatControl(content);
    if (first === null) {
      continue;
    }

    const codePoint = formatCodePoint(first.codePoint);
    const name = getUnicodeFormatControlName(first.codePoint);
    fail(
      `EVAL: ${file} contains Unicode format control ${codePoint} (${name})`,
    );
  }
}

async function verifyForbiddenPaths(): Promise<void> {
  for (const rootPath of FORBIDDEN_ROOT_PATHS) {
    try {
      const info = await stat(rootPath);
      if (info.isDirectory() || info.isFile()) {
        fail(`forbidden path exists: ${rootPath}`);
      }
    } catch {
      // path absent
    }
  }

  const files = await walkFiles(".");
  for (const path of files) {
    for (const pattern of FORBIDDEN_DOC_PATTERNS) {
      if (pattern.test(path)) {
        fail(`forbidden path matches policy: ${path}`);
      }
    }
  }

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const firstLines = content.split(/\r?\n/).slice(0, 200).join("\n");
    if (FORBIDDEN_HEADER_PATTERN.test(firstLines)) {
      fail(`${file} contains forbidden marker phrase in first 200 lines`);
    }
  }
}

async function verifyPlaceholderTokens(): Promise<void> {
  const files = await walkFiles(".");
  for (const file of files) {
    if (
      file.startsWith(".git/") || file.startsWith("node_modules/") ||
      file.startsWith("dist/")
    ) {
      continue;
    }

    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (containsPlaceholderToken(lines[index])) {
        fail(`${file}:${index + 1} contains forbidden placeholder token`);
      }
    }
  }
}

async function verifyRegressionGrammar(): Promise<void> {
  const source = await readFile("bench/datasets/regression.jsonl", "utf8");
  const records = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as { caseId?: string; packId?: string };
      } catch {
        fail(`bench/datasets/regression.jsonl:${index + 1} invalid JSON`);
      }
    });

  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    const line = index + 1;
    if (typeof entry.caseId !== "string" || !isValidCaseId(entry.caseId)) {
      fail(`bench/datasets/regression.jsonl:${line} invalid caseId grammar`);
    }
    if (typeof entry.packId !== "string" || !isValidPackId(entry.packId)) {
      fail(`bench/datasets/regression.jsonl:${line} invalid packId grammar`);
    }
  }
}

async function main(): Promise<void> {
  await act_scanRepoForUnicodeFormatControls();
  await verifyForbiddenPaths();
  await verifyPlaceholderTokens();
  await verifyRegressionGrammar();
  console.log("repo-text-check passed");
}

main().catch((error) => {
  console.error(
    `repo-text-check failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
