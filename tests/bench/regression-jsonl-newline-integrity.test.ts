import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, test } from "../harness.ts";

const REGRESSION_DATASET_PATH = join("bench", "datasets", "regression.jsonl");

test("regression.jsonl uses strict JSONL with multiple newline separators", async () => {
  const source = await readFile(REGRESSION_DATASET_PATH, "utf8");

  assert(
    source.endsWith("\n"),
    "regression.jsonl must end with a trailing newline",
  );

  const newlineCount = (source.match(/\n/g) ?? []).length;
  assert(
    newlineCount > 1,
    "regression.jsonl must contain more than one newline separator",
  );

  const lines = source.split("\n");
  let objectCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isLastLine = index === lines.length - 1;

    if (line.length === 0) {
      assert(
        isLastLine,
        `regression.jsonl has an empty non-terminal line at ${index + 1}`,
      );
      continue;
    }

    const parsed = JSON.parse(line) as unknown;
    assert(
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
      `regression.jsonl line ${index + 1} must be a JSON object`,
    );

    objectCount += 1;
  }

  assert(
    objectCount > 1,
    "regression.jsonl must include multiple JSONL records",
  );
});
