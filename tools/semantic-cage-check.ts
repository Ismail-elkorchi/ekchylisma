import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  containsPlaceholderToken,
  isValidCaseId,
  isValidPackId,
} from "../src/core/identifiers.ts";

const FORBIDDEN_DOC_PATTERNS = [
  /^docs\/PROGRAM_.*\.md$/,
  /^docs\/COMPETITION_.*\.md$/,
  /^docs\/.*SIGNAL.*\.md$/,
  /^docs\/.*WORKBENCH.*\.md$/,
];

const FORBIDDEN_ROOT_PATHS = ["WORKBENCH"];

const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);

function fail(message: string): never {
  throw new Error(message);
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
}

function hasDisallowedPublicWord(line: string): boolean {
  const matches = [...line.matchAll(/\bpublic\b/gi)];
  if (matches.length === 0) {
    return false;
  }

  let normalized = line;
  normalized = normalized.replace(/public API/g, "");
  return /\bpublic\b/i.test(normalized);
}

async function verifyDocsVocabulary(): Promise<void> {
  const docsFiles = await walkFiles("docs");
  for (const file of docsFiles) {
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (hasDisallowedPublicWord(lines[index])) {
        fail(`${file}:${index + 1} contains disallowed term`);
      }
    }
  }
}

async function verifyPlaceholderTokens(): Promise<void> {
  const files = await walkFiles(".");
  for (const file of files) {
    if (file.startsWith(".git/") || file.startsWith("node_modules/") || file.startsWith("dist/")) {
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

    const header = lines.slice(0, 200).join("\n").toLowerCase();
    const forbiddenPhrase = ["competition", "scan"].join(" ");
    if (header.includes(forbiddenPhrase)) {
      fail(`${file}: contains forbidden phrase in first 200 lines`);
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
  await verifyForbiddenPaths();
  await verifyDocsVocabulary();
  await verifyPlaceholderTokens();
  await verifyRegressionGrammar();
  console.log("semantic-cage-check passed");
}

main().catch((error) => {
  console.error(`semantic-cage-check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
