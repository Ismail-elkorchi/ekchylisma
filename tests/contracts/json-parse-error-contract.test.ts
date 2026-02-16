import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("json parse error contract supports deterministic line-based frame decode errors", async () => {
  const raw = await readFile("contracts/json-parse-error.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    required?: string[];
    properties?: {
      line?: { type?: string[] };
      column?: { type?: string[] };
      message?: { type?: string };
    };
  };

  assert(schema.required?.includes("line") === true, "line should be required");
  assert(
    schema.required?.includes("column") === true,
    "column should be required",
  );
  assertEqual(schema.properties?.message?.type, "string");
  assertEqual(
    JSON.stringify(schema.properties?.line?.type),
    JSON.stringify(["integer", "null"]),
  );
  assertEqual(
    JSON.stringify(schema.properties?.column?.type),
    JSON.stringify(["integer", "null"]),
  );
});
