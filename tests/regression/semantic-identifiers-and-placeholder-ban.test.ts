import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { isValidCaseId, isValidPackId } from "../../src/core/identifiers.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_REF =
  "2026-02-15--semantic-identifiers-and-placeholder-ban--477928bf";

const CASE_IDS = [
  "semantic-identifiers-and-placeholder-ban--google-langextract--375--0d7baea4",
  "semantic-identifiers-and-placeholder-ban--google-langextract--374--c5c2af44",
  "semantic-identifiers-and-placeholder-ban--google-langextract--372--1b9200fb",
  "semantic-identifiers-and-placeholder-ban--google-langextract--371--b4becc68",
  "semantic-identifiers-and-placeholder-ban--google-langextract--370--a0e673f1",
  "semantic-identifiers-and-placeholder-ban--google-langextract--369--d8f0f8cb",
  "semantic-identifiers-and-placeholder-ban--google-langextract--368--be8fca35",
  "semantic-identifiers-and-placeholder-ban--google-langextract--367--8d9c4ad8",
  "semantic-identifiers-and-placeholder-ban--google-langextract--366--09aa329e",
  "semantic-identifiers-and-placeholder-ban--google-langextract--362--4cc748fe",
  "semantic-identifiers-and-placeholder-ban--google-langextract--361--9c5006e8",
  "semantic-identifiers-and-placeholder-ban--google-langextract--360--f5f4d4f6",
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
  test(`semantic identifiers regression ${caseId}`, async () => {
    const entry = await findCase(caseId);

    assertEqual(isValidPackId(entry.packId), true, "packId grammar check");
    assertEqual(isValidCaseId(entry.caseId), true, "caseId grammar check");
    assert(
      entry.sourceQuote.length <= 280,
      "sourceQuote length must be <= 280",
    );

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
  });
}
