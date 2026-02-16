import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { assert, test } from "../harness.ts";

const TRACEABILITY_PATH = "SPEC_TRACEABILITY.md";

function looksLikeTrackedPath(token: string): boolean {
  if (token.includes(" ")) {
    return false;
  }

  if (token.startsWith("./")) {
    return false;
  }

  if (token.includes("*")) {
    return false;
  }

  if (token.startsWith("REQ-")) {
    return false;
  }

  if (
    token.startsWith("npm") || token.startsWith("node") ||
    token.startsWith("deno") ||
    token.startsWith("bun")
  ) {
    return false;
  }

  if (token.includes("(") || token.includes(")")) {
    return false;
  }

  if (token === "n/a") {
    return false;
  }

  if (token === "LICENSE" || token === "NOTICE") {
    return true;
  }

  if (token.includes("/")) {
    return true;
  }

  return /\.(md|ts|tsx|js|mjs|cjs|json|jsonl|yml|yaml|d\.ts)$/.test(token);
}

test("SPEC_TRACEABILITY does not reference stale file paths", async () => {
  const source = await readFile(TRACEABILITY_PATH, "utf8");
  const matches = [...source.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  const uniquePathTokens = [
    ...new Set(matches.filter((token) => looksLikeTrackedPath(token))),
  ];

  const missingPaths = uniquePathTokens.filter((path) => !existsSync(path));

  assert(
    missingPaths.length === 0,
    `SPEC_TRACEABILITY.md references missing path(s): ${
      missingPaths.join(", ")
    }`,
  );
});
