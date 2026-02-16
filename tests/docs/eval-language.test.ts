import { readFile } from "node:fs/promises";
import { assert, test } from "../harness.ts";

const EVAL_DOC_PATH = "docs/EVAL.md";
const FORBIDDEN_PATTERN =
  /\bWORKBENCH\b|\bPACK_ID\b|workbench pack|public regression harness/i;

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
