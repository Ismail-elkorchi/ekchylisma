import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("json schema subset contract excludes dialect-only keywords", async () => {
  const raw = await readFile(
    "contracts/json-schema-subset.schema.json",
    "utf8",
  );
  const schema = JSON.parse(raw) as {
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
  };

  assertEqual(schema.additionalProperties, false);
  assert(schema.properties !== undefined, "properties should be present");
  assertEqual("nullable" in schema.properties!, false);
  assertEqual("definitions" in schema.properties!, false);
  assertEqual("$defs" in schema.properties!, false);
  assertEqual("$schema" in schema.properties!, false);
});
