import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("program contract requires structured program shape fields", async () => {
  const raw = await readFile("contracts/program.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    required?: string[];
    properties?: {
      classes?: { minItems?: number };
      constraints?: { required?: string[] };
    };
  };

  assertEqual(
    JSON.stringify(schema.required),
    JSON.stringify([
      "description",
      "classes",
      "examples",
      "constraints",
      "instructions",
      "schema",
      "programHash",
    ]),
  );
  assertEqual(schema.properties?.classes?.minItems, 1);
  assert(
    schema.properties?.constraints?.required?.includes("requireExactQuote") ===
      true,
    "constraints.requireExactQuote should be required",
  );
  assert(
    schema.properties?.constraints?.required?.includes("forbidOverlap") ===
      true,
    "constraints.forbidOverlap should be required",
  );
});
