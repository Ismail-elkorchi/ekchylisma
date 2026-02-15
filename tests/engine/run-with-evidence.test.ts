import { sha256Hex } from "../../src/core/hash.ts";
import { compilePrompt, hashPromptText } from "../../src/engine/promptCompiler.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import {
  buildProviderRequest,
  buildRepairProviderRequest,
  runWithEvidence,
} from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

const documentText = "Alpha Beta";

async function buildProgram() {
  return {
    instructions: "Extract token Beta.",
    examples: [],
    schema: {
      type: "object",
    },
    programHash: await sha256Hex("Extract token Beta."),
  };
}

test("runWithEvidence returns shard outcomes and provenance for successful extraction", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      extractions: [
        {
          extractionClass: "token",
          quote: "Beta",
          span: {
            offsetMode: "utf16_code_unit",
            charStart: 6,
            charEnd: 10,
          },
          grounding: "explicit",
        },
      ],
    }),
  });

  const bundle = await runWithEvidence({
    runId: "bundle-success",
    program,
    document: {
      documentId: "doc-success",
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
    now: () => "2026-02-14T00:00:00.000Z",
    runtime: {
      name: "node",
      version: "test",
    },
  });

  assertEqual(bundle.bundleVersion, "1");
  assertEqual(bundle.runId, "bundle-success");
  assertEqual(bundle.provenance.documentId, "doc-success");
  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.diagnostics.emptyResultKind, "non_empty");
  assertEqual(bundle.diagnostics.failures.length, 0);
  assertEqual(bundle.diagnostics.shardOutcomes.length, 1);
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "success");
  assertEqual(bundle.diagnostics.promptLog.programHash, program.programHash);
  assertEqual(bundle.diagnostics.promptLog.shardPromptHashes.length, 1);
  assertEqual(bundle.diagnostics.budgetLog.time.timeBudgetMs, null);
  assertEqual(bundle.diagnostics.budgetLog.time.deadlineReached, false);
  assertEqual(bundle.diagnostics.budgetLog.repair.maxCandidateChars, null);
  assertEqual(bundle.diagnostics.budgetLog.repair.maxRepairChars, null);
  assertEqual(bundle.diagnostics.budgetLog.repair.candidateCharsTruncatedCount, 0);
  assertEqual(bundle.diagnostics.budgetLog.repair.repairCharsTruncatedCount, 0);
  assertEqual(bundle.diagnostics.multiPassLog.mode, "draft_validate_repair_finalize");
  assertEqual(bundle.diagnostics.multiPassLog.maxPasses, 2);
  assertEqual(bundle.diagnostics.multiPassLog.shards.length, 1);
  assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 1);

  const firstOutcome = bundle.diagnostics.shardOutcomes[0];
  const shardPrompt = compilePrompt(program, {
    shardId: firstOutcome.shardId,
    start: firstOutcome.start,
    end: firstOutcome.end,
    text: documentText.slice(firstOutcome.start, firstOutcome.end),
  });
  const expectedPromptHash = await hashPromptText(shardPrompt);
  assertEqual(
    bundle.diagnostics.promptLog.shardPromptHashes[0].promptHash,
    expectedPromptHash,
    "prompt hash log should match compiled shard prompt hash",
  );
  assertEqual(
    bundle.diagnostics.promptLog.shardPromptHashes[0].shardId,
    firstOutcome.shardId,
    "prompt hash log should reference shard id",
  );
});

test("runWithEvidence classifies valid empty output as empty_by_evidence", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: "{\"extractions\":[]}",
  });

  const bundle = await runWithEvidence({
    runId: "bundle-empty-evidence",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 0);
  assertEqual(bundle.diagnostics.emptyResultKind, "empty_by_evidence");
  assertEqual(bundle.diagnostics.failures.length, 0);
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "success");
});

test("runWithEvidence classifies parse failures as empty_by_failure with explicit shard failure", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: "I cannot provide JSON for this request.",
  });

  const bundle = await runWithEvidence({
    runId: "bundle-empty-failure",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 0);
  assertEqual(bundle.diagnostics.emptyResultKind, "empty_by_failure");
  assertEqual(bundle.diagnostics.failures.length, 1);
  assertEqual(bundle.diagnostics.failures[0].kind, "json_pipeline_failure");
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "failure");
  assert(
    bundle.diagnostics.shardOutcomes[0].status !== "failure"
      || bundle.diagnostics.shardOutcomes[0].failure.kind === "json_pipeline_failure",
    "failure outcome should retain explicit failure kind",
  );
});

test("runWithEvidence enforces timeBudgetMs and surfaces budget_exhausted failures", async () => {
  const program = await buildProgram();
  let providerCalls = 0;
  const provider = {
    name: "no-call-provider",
    async generate() {
      providerCalls += 1;
      throw new Error("provider should not be called after budget exhaustion");
    },
    async generateStructured() {
      providerCalls += 1;
      throw new Error("provider should not be called after budget exhaustion");
    },
  };

  const bundle = await runWithEvidence({
    runId: "bundle-time-budget",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
    nowMs: () => 0,
    timeBudgetMs: 0,
  });

  assertEqual(providerCalls, 0);
  assertEqual(bundle.extractions.length, 0);
  assertEqual(bundle.diagnostics.emptyResultKind, "empty_by_failure");
  assertEqual(bundle.diagnostics.failures.length, 1);
  assertEqual(bundle.diagnostics.failures[0].kind, "budget_exhausted");
  assertEqual(bundle.diagnostics.budgetLog.time.timeBudgetMs, 0);
  assertEqual(bundle.diagnostics.budgetLog.time.startedAtMs, 0);
  assertEqual(bundle.diagnostics.budgetLog.time.deadlineAtMs, 0);
  assertEqual(bundle.diagnostics.budgetLog.time.deadlineReached, true);
  assertEqual(bundle.diagnostics.multiPassLog.shards.length, 1);
  assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 0);
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "failure");
  assert(
    bundle.diagnostics.shardOutcomes[0].status !== "failure"
      || bundle.diagnostics.shardOutcomes[0].failure.kind === "budget_exhausted",
    "failure outcome should surface budget exhaustion kind",
  );
});

test("runWithEvidence records repair cap diagnostics and deterministic failure shape", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      extractions: [
        {
          extractionClass: "token",
          quote: "Beta",
          span: {
            offsetMode: "utf16_code_unit",
            charStart: 6,
            charEnd: 10,
          },
          grounding: "explicit",
        },
      ],
    }),
  });

  const baseOptions = {
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
    repairBudgets: {
      maxRepairChars: 24,
    },
  } as const;

  const first = await runWithEvidence({
    runId: "bundle-repair-cap-1",
    ...baseOptions,
  });
  const second = await runWithEvidence({
    runId: "bundle-repair-cap-2",
    ...baseOptions,
  });

  assertEqual(first.extractions.length, 0);
  assertEqual(first.diagnostics.failures.length, 1);
  assertEqual(first.diagnostics.failures[0].kind, "json_pipeline_failure");
  assertEqual(first.diagnostics.budgetLog.repair.maxCandidateChars, null);
  assertEqual(first.diagnostics.budgetLog.repair.maxRepairChars, 24);
  assertEqual(first.diagnostics.budgetLog.repair.candidateCharsTruncatedCount, 0);
  assertEqual(first.diagnostics.budgetLog.repair.repairCharsTruncatedCount, 1);
  assertEqual(second.diagnostics.failures.length, 1);
  assertEqual(second.diagnostics.failures[0].kind, "json_pipeline_failure");
  assertEqual(
    first.diagnostics.failures[0].message,
    second.diagnostics.failures[0].message,
    "repair cap failures should be deterministic for identical inputs",
  );
});

test("runWithEvidence repairs payload shape failure on second pass and finalizes extraction", async () => {
  const program = await buildProgram();
  const badDraft = "{\"items\":[]}";
  const repaired = JSON.stringify({
    extractions: [
      {
        extractionClass: "token",
        quote: "Beta",
        span: {
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
        },
        grounding: "explicit",
      },
    ],
  });

  const shard = (await chunkDocument(documentText, program.programHash, {
    documentId: "doc-multi-pass-shape",
    chunkSize: 64,
    overlap: 0,
    offsetMode: "utf16_code_unit",
  }))[0];
  const draftRequest = buildProviderRequest(program, shard, "fake-model");
  const draftHash = await hashProviderRequest(draftRequest);
  const repairRequest = buildRepairProviderRequest(program, shard, "fake-model", {
    previousResponseText: badDraft,
    failureKind: "payload_shape_failure",
    failureMessage: "Provider response must be an array or object with `extractions` array.",
    priorPass: 1,
  });
  const repairHash = await hashProviderRequest(repairRequest);

  const provider = new FakeProvider({
    defaultResponse: badDraft,
    responses: {
      [draftHash]: badDraft,
      [repairHash]: repaired,
    },
  });

  const bundle = await runWithEvidence({
    runId: "bundle-multi-pass-shape",
    program,
    document: {
      documentId: "doc-multi-pass-shape",
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.diagnostics.failures.length, 0);
  assertEqual(bundle.diagnostics.multiPassLog.shards.length, 1);
  assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 2);
  assertEqual(
    bundle.diagnostics.multiPassLog.shards[0].stages.some((stage) =>
      stage.stage === "repair" && stage.failureKind === "payload_shape_failure"
    ),
    true,
  );
});

test("runWithEvidence repairs quote mismatch failure on second pass and finalizes extraction", async () => {
  const program = await buildProgram();
  const badDraft = JSON.stringify({
    extractions: [
      {
        extractionClass: "token",
        quote: "Gamma",
        span: {
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
        },
        grounding: "explicit",
      },
    ],
  });
  const repaired = JSON.stringify({
    extractions: [
      {
        extractionClass: "token",
        quote: "Beta",
        span: {
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
        },
        grounding: "explicit",
      },
    ],
  });

  const shard = (await chunkDocument(documentText, program.programHash, {
    documentId: "doc-multi-pass-quote",
    chunkSize: 64,
    overlap: 0,
    offsetMode: "utf16_code_unit",
  }))[0];
  const draftRequest = buildProviderRequest(program, shard, "fake-model");
  const draftHash = await hashProviderRequest(draftRequest);
  const repairRequest = buildRepairProviderRequest(program, shard, "fake-model", {
    previousResponseText: badDraft,
    failureKind: "quote_invariant_failure",
    failureMessage: "Extraction quote does not match the document slice at span.",
    priorPass: 1,
  });
  const repairHash = await hashProviderRequest(repairRequest);

  const provider = new FakeProvider({
    defaultResponse: badDraft,
    responses: {
      [draftHash]: badDraft,
      [repairHash]: repaired,
    },
  });

  const bundle = await runWithEvidence({
    runId: "bundle-multi-pass-quote",
    program,
    document: {
      documentId: "doc-multi-pass-quote",
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.diagnostics.failures.length, 0);
  assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 2);
  assertEqual(
    bundle.diagnostics.multiPassLog.shards[0].stages.some((stage) =>
      stage.stage === "repair" && stage.failureKind === "quote_invariant_failure"
    ),
    true,
  );
});
