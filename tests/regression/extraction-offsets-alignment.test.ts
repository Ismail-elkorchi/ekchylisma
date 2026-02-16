import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_ID = "2026-02-15--extraction-offsets-alignment--6f2b1c9d";

test("extraction offsets alignment regression pack runs in fake-provider mode", async () => {
  const records = await loadRegressionDataset("bench/datasets/regression.jsonl");
  const entries = records.filter((entry) => entry.packId === PACK_ID);
  assertEqual(entries.length, 12, "expected exactly 12 regression records in pack");

  for (const entry of entries) {
    const provider = new FakeProvider({ defaultResponse: entry.providerResponseText });
    const legacyProgramHash = await sha256Hex(
      `${entry.instructions}:${JSON.stringify(entry.targetSchema)}`,
    );

    const bundle = await runWithEvidence({
      runId: `regression-${entry.caseId}`,
      program: {
        instructions: entry.instructions,
        examples: [],
        schema: entry.targetSchema,
        programHash: legacyProgramHash,
      },
      document: {
        documentId: entry.caseId,
        text: entry.documentText,
      },
      provider,
      model: "fake-model",
      chunkSize: 8192,
      overlap: 0,
    });

    assertEqual(bundle.diagnostics.emptyResultKind, entry.expected.emptyResultKind);
    assert(
      bundle.extractions.length >= entry.expected.minExtractions
        && bundle.extractions.length <= entry.expected.maxExtractions,
      "extraction count must match expected bounds",
    );

    for (const extraction of bundle.extractions) {
      assertEqual(extraction.offsetMode, "utf16_code_unit");
      assertEqual(extraction.span.offsetMode, "utf16_code_unit");
      assertEqual(extraction.span.charStart, extraction.charStart);
      assertEqual(extraction.span.charEnd, extraction.charEnd);
    }
  }
});
