import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("json parse error contract supports deterministic line-based frame decode errors", async () => {
  const raw = await readFile("contracts/json-parse-error.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    required?: string[];
    properties?: {
      failureCode?: { type?: string; enum?: string[] };
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
  assert(
    schema.required?.includes("failureCode") === true,
    "failureCode should be required",
  );
  assertEqual(schema.properties?.message?.type, "string");
  assertEqual(schema.properties?.failureCode?.type, "string");
  assert(
    (schema.properties?.failureCode?.enum?.length ?? 0) > 0,
    "failureCode should define a stable enum",
  );
  assertEqual(
    JSON.stringify(schema.properties?.line?.type),
    JSON.stringify(["integer", "null"]),
  );
  assertEqual(
    JSON.stringify(schema.properties?.column?.type),
    JSON.stringify(["integer", "null"]),
  );
});
