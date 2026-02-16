import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_REF = "2026-02-15--program-shape-alignment--3ac17d5e";

test("program shape alignment regression pack runs in fake-provider mode", async () => {
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

    assertEqual(
      bundle.diagnostics.emptyResultKind,
      entry.expected.emptyResultKind,
    );
    assert(
      bundle.extractions.length >= entry.expected.minExtractions &&
        bundle.extractions.length <= entry.expected.maxExtractions,
      "extraction count must match expected bounds",
    );
    assertEqual(bundle.program.description, entry.instructions);
    assert(
      bundle.program.classes.length >= 1,
      "normalized program should contain classes",
    );
    assertEqual(bundle.program.constraints.requireExactQuote, true);
    assertEqual(bundle.program.constraints.forbidOverlap, true);
  }
});
