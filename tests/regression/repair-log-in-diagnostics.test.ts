import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_REF = "2026-02-15--repair-log-in-diagnostics--477928bf";

const CASE_IDS = [
  "repair-log-in-diagnostics--google-langextract--375--5a10c260",
  "repair-log-in-diagnostics--google-langextract--374--da274415",
  "repair-log-in-diagnostics--google-langextract--372--de1182f6",
  "repair-log-in-diagnostics--google-langextract--371--39e206a5",
  "repair-log-in-diagnostics--google-langextract--370--14e1bc30",
  "repair-log-in-diagnostics--google-langextract--369--842153dd",
  "repair-log-in-diagnostics--google-langextract--368--7fe0122a",
  "repair-log-in-diagnostics--google-langextract--367--eb81b344",
  "repair-log-in-diagnostics--google-langextract--366--7bd73697",
  "repair-log-in-diagnostics--google-langextract--362--1856b6c5",
  "repair-log-in-diagnostics--google-langextract--361--2d8b3a7e",
  "repair-log-in-diagnostics--google-langextract--360--fec08aee",
] as const;

async function findCase(caseId: string) {
  const records = await loadRegressionDataset(
    "bench/datasets/regression.jsonl",
  );
  const entry = records.find((item) =>
    item.caseId === caseId && item.packId === PACK_REF
  );
  if (!entry) {
    throw new Error(`missing regression record for ${caseId}`);
  }
  return entry;
}

for (const caseId of CASE_IDS) {
  test(`repair log diagnostics regression ${caseId}`, async () => {
    const entry = await findCase(caseId);
    const provider = new FakeProvider({
      defaultResponse: entry.providerResponseText,
    });

    const programHash = await sha256Hex(
      `${entry.instructions}:${JSON.stringify(entry.targetSchema)}`,
    );
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

    assertEqual(
      bundle.diagnostics.emptyResultKind,
      entry.expected.emptyResultKind,
    );
    assert(
      bundle.extractions.length >= entry.expected.minExtractions &&
        bundle.extractions.length <= entry.expected.maxExtractions,
      "extraction count must match expected bounds",
    );
    assertEqual(bundle.diagnostics.repairLog.entries.length, 1);
    assertEqual(bundle.diagnostics.repairLog.entries[0].changed, true);
    assertEqual(
      bundle.diagnostics.repairLog.entries[0].appliedSteps.includes(
        "fixTrailingCommas",
      ),
      true,
    );
  });
}
