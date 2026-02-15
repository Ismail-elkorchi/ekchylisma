import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_ID = "2026-02-15--executor-evidence-classification--5d9e8c1a";

test("executor evidence classification regression pack runs in fake-provider mode", async () => {
  const records = await loadRegressionDataset("bench/datasets/regression.jsonl");
  const entries = records.filter((entry) => entry.packId === PACK_ID);
  assertEqual(entries.length, 8, "expected exactly 8 regression records in pack");

  for (const entry of entries) {
    const provider = new FakeProvider({ defaultResponse: entry.providerResponseText });
    const programHash = await sha256Hex(`${entry.instructions}:${JSON.stringify(entry.targetSchema)}`);

    const bundle = await runWithEvidence({
      runId: `regression-${entry.caseId}`,
      program: {
        instructions: entry.instructions,
        examples: [],
        schema: entry.targetSchema,
        programHash,
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

    const expectedCompleteness = entry.expected.emptyResultKind === "empty_by_failure"
      ? "complete_failure"
      : "complete_success";
    assertEqual(
      bundle.diagnostics.runCompleteness.kind,
      expectedCompleteness,
      "run completeness should match expected failure/evidence classification",
    );
  }
});
