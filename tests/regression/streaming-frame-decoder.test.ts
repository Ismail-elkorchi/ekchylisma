import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_REF = "2026-02-15--streaming-frame-decoder--4a2f9c1e";

test("streaming frame decoder regression pack runs in fake-provider mode", async () => {
  const records = await loadRegressionDataset(
    "bench/datasets/regression.jsonl",
  );
  const entries = records.filter((entry) => entry.packId === PACK_REF);
  assertEqual(
    entries.length,
    12,
    "expected exactly 12 regression records in pack",
  );

  for (const entry of entries) {
    const provider = new FakeProvider({
      defaultResponse: entry.providerResponseText,
    });
    const bundle = await runWithEvidence({
      runId: `regression-${entry.caseId}`,
      program: {
        instructions: entry.instructions,
        examples: [],
        schema: entry.targetSchema,
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

    assertEqual(
      bundle.diagnostics.emptyResultKind,
      entry.expected.emptyResultKind,
    );
    assert(
      bundle.extractions.length >= entry.expected.minExtractions &&
        bundle.extractions.length <= entry.expected.maxExtractions,
      "extraction count must match expected bounds",
    );
  }
});
