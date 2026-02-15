import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import { buildProviderRequest, runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_ID = "2026-02-15--provider-structured-generate-split--477928bf";

const CASE_IDS = [
  "provider-structured-generate-split--google-langextract--375--7252748a",
  "provider-structured-generate-split--google-langextract--374--9b0bcacb",
  "provider-structured-generate-split--google-langextract--372--0c198274",
  "provider-structured-generate-split--google-langextract--371--973170ab",
  "provider-structured-generate-split--google-langextract--370--1839e33e",
  "provider-structured-generate-split--google-langextract--369--aa7ddb14",
  "provider-structured-generate-split--google-langextract--368--b4e03f1f",
  "provider-structured-generate-split--google-langextract--367--f186b319",
  "provider-structured-generate-split--google-langextract--366--84f49a74",
  "provider-structured-generate-split--google-langextract--362--6ded2924",
  "provider-structured-generate-split--google-langextract--361--d24aecba",
  "provider-structured-generate-split--google-langextract--360--5f42b607",
] as const;

type StructuredSplitScript = {
  mode: "structured_split_v1";
  generate: string;
  generateStructured: string;
};

function parseStructuredSplitScript(source: string): StructuredSplitScript {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  if (
    parsed.mode !== "structured_split_v1"
    || typeof parsed.generate !== "string"
    || typeof parsed.generateStructured !== "string"
  ) {
    throw new Error("invalid structured_split_v1 script");
  }

  return {
    mode: "structured_split_v1",
    generate: parsed.generate,
    generateStructured: parsed.generateStructured,
  };
}

async function findCase(caseId: string) {
  const records = await loadRegressionDataset("bench/datasets/regression.jsonl");
  const entry = records.find((item) => item.caseId === caseId && item.packId === PACK_ID);
  if (!entry) {
    throw new Error(`missing regression record for ${caseId}`);
  }
  return entry;
}

for (const caseId of CASE_IDS) {
  test(`provider structured split regression ${caseId}`, async () => {
    const entry = await findCase(caseId);
    const script = parseStructuredSplitScript(entry.providerResponseText);

    const programHash = await sha256Hex(`${entry.instructions}:${JSON.stringify(entry.targetSchema)}`);
    const program = {
      instructions: entry.instructions,
      examples: [],
      schema: entry.targetSchema,
      programHash,
    };

    const provider = new FakeProvider({
      defaultResponse: script.generate,
      structuredDefaultResponse: script.generateStructured,
    });

    const shards = await chunkDocument(entry.documentText, programHash, {
      documentId: entry.caseId,
      chunkSize: 8192,
      overlap: 0,
      offsetMode: "utf16_code_unit",
    });

    for (const shard of shards) {
      const request = buildProviderRequest(program, shard, "fake-model");
      const requestHash = await hashProviderRequest(request);
      provider.setResponse(requestHash, script.generate);
      provider.setStructuredResponse(requestHash, script.generateStructured);
    }

    const bundle = await runWithEvidence({
      runId: `regression-${entry.caseId}`,
      program,
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
    assertEqual(bundle.diagnostics.failures.length, 0);
    assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 1);
  });
}
