import { readFile } from "node:fs/promises";
import { assert, test } from "../harness.ts";

test("SPEC_TRACEABILITY main table has unique REQ ids", async () => {
  const source = await readFile("SPEC_TRACEABILITY.md", "utf8");
  const reqIds = source
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").map((cell) => cell.trim())[1] ?? "")
    .filter((token) => /^REQ-\d+(?:\.\d+)*$/.test(token));

  const counts = new Map<string, number>();
  for (const reqId of reqIds) {
    counts.set(reqId, (counts.get(reqId) ?? 0) + 1);
  }

  const duplicateIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([reqId, count]) => `${reqId} (${count})`);

  assert(
    duplicateIds.length === 0,
    `duplicate REQ IDs found in SPEC_TRACEABILITY.md: ${
      duplicateIds.join(", ")
    }`,
  );
});
