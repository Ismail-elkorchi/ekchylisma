import { readFile } from "node:fs/promises";
import { assert, test } from "../harness.ts";

const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";

test("release workflow pins every uses step to a full SHA", async () => {
  const source = await readFile(RELEASE_WORKFLOW_PATH, "utf8");
  const usesLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- uses: "));

  assert(
    usesLines.length > 0,
    "release workflow must contain at least one uses step",
  );

  for (const line of usesLines) {
    assert(
      /@[0-9a-f]{40}\b/.test(line),
      `release workflow step is not pinned to a full SHA: ${line}`,
    );
  }
});
