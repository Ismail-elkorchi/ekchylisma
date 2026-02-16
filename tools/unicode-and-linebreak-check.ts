import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SCAN_ROOTS = [
  "src",
  "tests",
  "tools",
  "scripts",
  "docs",
  "bench",
  "contracts",
  ".github",
];

const FORBIDDEN_CODEPOINTS = new Set<number>([
  0x200b,
  0x200c,
  0x200d,
  0x2028,
  0x2029,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
  0xfeff,
]);

type Violation = {
  filePath: string;
  message: string;
};

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isLikelyText(buffer: Buffer): boolean {
  return !buffer.includes(0x00);
}

async function getTrackedScanFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", [
    "ls-files",
    "--",
    ...SCAN_ROOTS,
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function collectForbiddenCodePointViolations(
  filePath: string,
  content: string,
): Violation[] {
  const violations: Violation[] = [];
  let byteOffset = 0;

  for (const char of content) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && FORBIDDEN_CODEPOINTS.has(codePoint)) {
      violations.push({
        filePath,
        message: `${filePath}: forbidden codepoint ${
          formatCodePoint(codePoint)
        } at byte offset ${byteOffset}`,
      });
    }

    byteOffset += Buffer.byteLength(char, "utf8");
  }

  return violations;
}

function parseStrictJsonlObjectCount(filePath: string, source: string): number {
  const lines = source.split("\n");
  let objectCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const isLastLine = index === lines.length - 1;

    if (line.length === 0) {
      if (!isLastLine) {
        throw new Error(
          `${filePath}:line ${lineNumber} empty lines are not allowed in JSONL`,
        );
      }
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`${filePath}:line ${lineNumber} invalid JSONL record`);
    }

    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) {
      throw new Error(
        `${filePath}:line ${lineNumber} JSONL records must be JSON objects`,
      );
    }

    objectCount += 1;
  }

  return objectCount;
}

function collectJsonlViolations(filePath: string, source: string): Violation[] {
  if (!filePath.endsWith(".jsonl")) {
    return [];
  }

  const violations: Violation[] = [];
  const newlineCount = (source.match(/\n/g) ?? []).length;

  if (!source.endsWith("\n")) {
    violations.push({
      filePath,
      message: `${filePath}: JSONL file must end with a newline`,
    });
  }

  try {
    const objectCount = parseStrictJsonlObjectCount(filePath, source);
    if (newlineCount < 2 && objectCount > 1) {
      violations.push({
        filePath,
        message:
          `${filePath}: JSONL file has ${objectCount} objects but only ${newlineCount} newline characters`,
      });
    }
  } catch (error) {
    violations.push({
      filePath,
      message: error instanceof Error
        ? error.message
        : `${filePath}: invalid JSONL`,
    });
  }

  return violations;
}

async function run(): Promise<void> {
  const trackedFiles = await getTrackedScanFiles();
  const violations: Violation[] = [];

  for (const filePath of trackedFiles) {
    const buffer = await readFile(filePath);
    if (!isLikelyText(buffer)) {
      continue;
    }

    const content = buffer.toString("utf8");
    violations.push(...collectForbiddenCodePointViolations(filePath, content));
    violations.push(...collectJsonlViolations(filePath, content));
  }

  if (violations.length > 0) {
    console.error("unicode-and-linebreak-check failed:");
    for (const violation of violations) {
      console.error(`- ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `unicode-and-linebreak-check passed (${trackedFiles.length} tracked files scanned).`,
  );
}

run().catch((error) => {
  console.error(
    `unicode-and-linebreak-check failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
