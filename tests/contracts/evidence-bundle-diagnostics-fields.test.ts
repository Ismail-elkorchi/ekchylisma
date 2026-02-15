import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("evidence bundle contract requires runCompleteness diagnostics fields", async () => {
  const raw = await readFile("contracts/evidence-bundle.schema.json", "utf8");
  const schema = JSON.parse(raw) as {
    properties?: {
      diagnostics?: {
        required?: string[];
        properties?: {
          runCompleteness?: {
            required?: string[];
            properties?: {
              kind?: {
                enum?: string[];
              };
            };
          };
        };
      };
    };
  };

  const diagnostics = schema.properties?.diagnostics;
  assert(diagnostics !== undefined, "diagnostics schema should exist");
  assert(diagnostics.required?.includes("runCompleteness"), "runCompleteness should be required");

  const runCompleteness = diagnostics.properties?.runCompleteness;
  assert(runCompleteness !== undefined, "runCompleteness schema should exist");
  assertEqual(
    JSON.stringify(runCompleteness.required),
    JSON.stringify(["kind", "totalShards", "successfulShards", "failedShards"]),
  );
  assertEqual(
    JSON.stringify(runCompleteness.properties?.kind?.enum),
    JSON.stringify(["complete_success", "partial_success", "complete_failure"]),
  );
});
