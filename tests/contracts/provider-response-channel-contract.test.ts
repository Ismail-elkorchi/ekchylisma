import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("provider response contract requires deterministic output channel metadata", async () => {
  const raw = await readFile("contracts/provider-response.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    required?: string[];
    properties?: {
      outputChannel?: {
        enum?: string[];
      };
    };
  };

  assert(
    schema.required?.includes("outputChannel") === true,
    "outputChannel should be required",
  );
  assertEqual(
    JSON.stringify(schema.properties?.outputChannel?.enum),
    JSON.stringify(["text", "tool_call"]),
  );
});
