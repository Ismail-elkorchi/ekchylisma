import { readFile } from "node:fs/promises";
import { assert, test } from "../harness.ts";

const EVAL_DOC_PATH = "docs/EVAL.md";
const WORKFLOW_TOKEN = ["WORK", "BENCH"].join("");
const PACK_TOKEN = ["PACK", "_ID"].join("");
const WORKFLOW_PHRASE = ["workbench", "pack"].join(" ");
const HARNESS_PHRASE = ["public", "regression", "harness"].join(" ");
const FORBIDDEN_PATTERN = new RegExp(
  `\\b${WORKFLOW_TOKEN}\\b|\\b${PACK_TOKEN}\\b|${WORKFLOW_PHRASE}|${HARNESS_PHRASE}`,
  "i",
);

test("EVAL documentation excludes internal workflow tokens", async () => {
  const source = await readFile(EVAL_DOC_PATH, "utf8");
  const match = source.match(FORBIDDEN_PATTERN);
  assert(
    match === null,
    `docs/EVAL.md contains forbidden workflow token: ${
      match?.[0] ?? "unknown"
    }`,
  );
});
