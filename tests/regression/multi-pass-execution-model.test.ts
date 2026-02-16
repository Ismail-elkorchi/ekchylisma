import { loadRegressionDataset } from "../../bench/regressionDataset.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import {
  buildProviderRequest,
  buildRepairProviderRequest,
  runWithEvidence,
} from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const PACK_REF = "2026-02-15--multi-pass-execution-model--477928bf";

const CASE_IDS = [
  "multi-pass-execution-model--google-langextract--375--9c53aca8",
  "multi-pass-execution-model--google-langextract--374--21df902a",
  "multi-pass-execution-model--google-langextract--372--0d7e1ece",
  "multi-pass-execution-model--google-langextract--371--36aa31eb",
  "multi-pass-execution-model--google-langextract--370--ce92dd38",
  "multi-pass-execution-model--google-langextract--369--610fb253",
  "multi-pass-execution-model--google-langextract--368--41c0ea76",
  "multi-pass-execution-model--google-langextract--367--08137dd2",
  "multi-pass-execution-model--google-langextract--366--8038c4fe",
  "multi-pass-execution-model--google-langextract--362--3de1042e",
  "multi-pass-execution-model--google-langextract--361--f9361cdf",
  "multi-pass-execution-model--google-langextract--360--332383de",
] as const;

type MultiPassScript = {
  mode: "multi_pass_v1";
  draft: string;
  repair: string;
  failureKind:
    | "json_pipeline_failure"
    | "payload_shape_failure"
    | "quote_invariant_failure";
  failureMessage?: string;
};

function defaultFailureMessage(kind: MultiPassScript["failureKind"]): string {
  if (kind === "payload_shape_failure") {
    return "Provider response must be an array or object with `extractions` array.";
  }
  if (kind === "quote_invariant_failure") {
    return "Extraction quote does not match the document slice at span.";
  }
  return "Unexpected non-whitespace character after JSON at position 0";
}

function parseMultiPassScript(source: string): MultiPassScript {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  if (
    parsed.mode !== "multi_pass_v1" ||
    typeof parsed.draft !== "string" ||
    typeof parsed.repair !== "string" ||
    (
      parsed.failureKind !== "json_pipeline_failure" &&
      parsed.failureKind !== "payload_shape_failure" &&
      parsed.failureKind !== "quote_invariant_failure"
    )
  ) {
    throw new Error("invalid multi_pass_v1 script");
  }

  return {
    mode: "multi_pass_v1",
    draft: parsed.draft,
    repair: parsed.repair,
    failureKind: parsed.failureKind,
    failureMessage: typeof parsed.failureMessage === "string"
      ? parsed.failureMessage
      : undefined,
  };
}

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
  test(`multi-pass execution model regression ${caseId}`, async () => {
    const entry = await findCase(caseId);
    const script = parseMultiPassScript(entry.providerResponseText);

    const provider = new FakeProvider({
      defaultResponse: script.draft,
    });

    const programHash = await sha256Hex(
      `${entry.instructions}:${JSON.stringify(entry.targetSchema)}`,
    );
    const program = {
      instructions: entry.instructions,
      examples: [],
      schema: entry.targetSchema,
      programHash,
    };

    const shards = await chunkDocument(entry.documentText, programHash, {
      documentId: entry.caseId,
      chunkSize: 8192,
      overlap: 0,
      offsetMode: "utf16_code_unit",
    });

    for (const shard of shards) {
      const draftRequest = buildProviderRequest(program, shard, "fake-model");
      const draftHash = await hashProviderRequest(draftRequest);
      provider.setResponse(draftHash, script.draft);

      const repairRequest = buildRepairProviderRequest(
        program,
        shard,
        "fake-model",
        {
          previousResponseText: script.draft,
          failureKind: script.failureKind,
          failureMessage: script.failureMessage ??
            defaultFailureMessage(script.failureKind),
          priorPass: 1,
        },
      );
      const repairHash = await hashProviderRequest(repairRequest);
      provider.setResponse(repairHash, script.repair);
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

    assertEqual(
      bundle.diagnostics.emptyResultKind,
      entry.expected.emptyResultKind,
    );
    assert(
      bundle.extractions.length >= entry.expected.minExtractions &&
        bundle.extractions.length <= entry.expected.maxExtractions,
      "extraction count must match expected bounds",
    );
    assertEqual(bundle.diagnostics.multiPassLog.shards.length, 1);
    assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 2);
  });
}
