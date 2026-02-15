import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("extraction contract requires top-level offsets and mirrored span", async () => {
  const raw = await readFile("contracts/extraction.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    required?: string[];
    properties?: {
      offsetMode?: { enum?: string[] };
      charStart?: { type?: string; minimum?: number };
      charEnd?: { type?: string; minimum?: number };
      span?: { $ref?: string };
    };
  };

  assertEqual(
    JSON.stringify(schema.required),
    JSON.stringify([
      "extractionClass",
      "quote",
      "offsetMode",
      "charStart",
      "charEnd",
      "span",
      "grounding",
    ]),
  );
  assertEqual(schema.properties?.offsetMode?.enum?.[0], "utf16_code_unit");
  assertEqual(schema.properties?.charStart?.type, "integer");
  assertEqual(schema.properties?.charStart?.minimum, 0);
  assertEqual(schema.properties?.charEnd?.type, "integer");
  assertEqual(schema.properties?.charEnd?.minimum, 0);
  assert(
    schema.properties?.span?.$ref === "./span.schema.json",
    "span schema reference should be present",
  );
});
