import { sha256Hex } from "../../src/core/hash.ts";
import {
  compilePrompt,
  hashPromptText,
} from "../../src/engine/promptCompiler.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import {
  buildProviderRequest,
  buildRepairProviderRequest,
  runWithEvidence,
} from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

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
  assertEqual(bundle.diagnostics.runCompleteness.kind, "complete_success");
  assertEqual(bundle.diagnostics.runCompleteness.totalShards, 1);
  assertEqual(bundle.diagnostics.runCompleteness.successfulShards, 1);
  assertEqual(bundle.diagnostics.runCompleteness.failedShards, 0);
  assertEqual(bundle.diagnostics.failures.length, 0);
  assertEqual(bundle.diagnostics.shardOutcomes.length, 1);
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "success");
  assertEqual(bundle.diagnostics.promptLog.programHash, program.programHash);
  assertEqual(bundle.diagnostics.promptLog.shardPromptHashes.length, 1);
  assertEqual(bundle.diagnostics.budgetLog.time.timeBudgetMs, null);
  assertEqual(bundle.diagnostics.budgetLog.time.deadlineReached, false);
  assertEqual(bundle.diagnostics.budgetLog.repair.maxCandidateChars, null);
  assertEqual(bundle.diagnostics.budgetLog.repair.maxRepairChars, null);
  assertEqual(
    bundle.diagnostics.budgetLog.repair.candidateCharsTruncatedCount,
    0,
  );
  assertEqual(bundle.diagnostics.budgetLog.repair.repairCharsTruncatedCount, 0);
  assertEqual(
    bundle.diagnostics.multiPassLog.mode,
    "draft_validate_repair_finalize",
  );
  assertEqual(bundle.diagnostics.multiPassLog.maxPasses, 2);
  assertEqual(bundle.diagnostics.multiPassLog.shards.length, 1);
  assertEqual(bundle.diagnostics.multiPassLog.shards[0].finalPass, 1);
  assertEqual(bundle.diagnostics.repairLog.entries.length, 1);
  assertEqual(bundle.diagnostics.repairLog.entries[0].parseOk, true);

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

test("runWithEvidence normalizes legacy program input into structured program shape", async () => {
  const legacyProgram = await buildProgram();
  const bundle = await runWithEvidence({
    runId: "bundle-program-shape-normalize",
    program: legacyProgram,
    document: {
      text: documentText,
    },
    provider: new FakeProvider({ defaultResponse: '{"extractions":[]}' }),
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.program.description, legacyProgram.instructions);
  assertEqual(bundle.program.classes.length, 1);
  assertEqual(bundle.program.classes[0].name, "extraction");
  assertEqual(bundle.program.constraints.requireExactQuote, true);
  assertEqual(bundle.program.constraints.forbidOverlap, true);
  assert(
    bundle.program.programId.startsWith("program-"),
    "programId should be generated",
  );
});

test("runWithEvidence normalizes schema dialect metadata into canonical subset", async () => {
  const bundle = await runWithEvidence({
    runId: "bundle-schema-dialect-normalized",
    program: {
      instructions: "Extract token Beta.",
      examples: [],
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Ticket",
        type: "object",
        required: ["value"],
        properties: {
          value: {
            type: "string",
            nullable: true,
          },
        },
      },
    },
    document: {
      text: documentText,
    },
    provider: new FakeProvider({ defaultResponse: '{"extractions":[]}' }),
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(
    JSON.stringify(bundle.program.schema),
    JSON.stringify({
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { const: null },
          ],
        },
      },
      required: ["value"],
    }),
  );
});

test("runWithEvidence rejects unsupported schema dialect keywords deterministically", async () => {
  await assertRejects(
    () =>
      runWithEvidence({
        runId: "bundle-schema-dialect-unsupported",
        program: {
          instructions: "Extract token Beta.",
          examples: [],
          schema: {
            type: "object",
            definitions: {
              token: { type: "string" },
            },
          },
        },
        document: {
          text: documentText,
        },
        provider: new FakeProvider({ defaultResponse: '{"extractions":[]}' }),
        model: "fake-model",
        chunkSize: 64,
        overlap: 0,
      }),
    (error) => error instanceof Error && error.message.includes("definitions"),
    "unsupported schema dialect keys should fail normalization",
  );
});

test("runWithEvidence rejects invalid program class declarations deterministically", async () => {
  await assertRejects(
    () =>
      runWithEvidence({
        runId: "bundle-program-shape-invalid",
        program: {
          instructions: "Extract token Beta.",
          examples: [],
          schema: { type: "object" },
          classes: [{ name: "token" }, { name: "token" }],
        },
        document: {
          text: documentText,
        },
        provider: new FakeProvider({ defaultResponse: '{"extractions":[]}' }),
        model: "fake-model",
        chunkSize: 64,
        overlap: 0,
      }),
    (error) =>
      error instanceof Error && error.message.includes("duplicate name"),
    "duplicate class declarations should fail normalization",
  );
});

test("runWithEvidence classifies valid empty output as empty_by_evidence", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: '{"extractions":[]}',
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
  assertEqual(bundle.diagnostics.runCompleteness.kind, "complete_success");
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
  assertEqual(bundle.diagnostics.runCompleteness.kind, "complete_failure");
  assertEqual(bundle.diagnostics.failures.length, 1);
  assertEqual(bundle.diagnostics.failures[0].kind, "json_pipeline_failure");
  assertEqual(bundle.diagnostics.repairLog.entries.length, 1);
  assertEqual(bundle.diagnostics.repairLog.entries[0].parseOk, false);
  assertEqual(bundle.diagnostics.shardOutcomes[0].status, "failure");
  assert(
    bundle.diagnostics.shardOutcomes[0].status !== "failure" ||
      bundle.diagnostics.shardOutcomes[0].failure.kind ===
        "json_pipeline_failure",
    "failure outcome should retain explicit failure kind",
  );
});

test("runWithEvidence prefers tool-call payload envelopes before text fallback", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              extractions: [
                {
                  extractionClass: "token",
                  quote: "Alpha",
                  span: {
                    offsetMode: "utf16_code_unit",
                    charStart: 0,
                    charEnd: 5,
                  },
                  grounding: "explicit",
                },
              ],
            }),
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
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
                },
              },
            ],
          },
        },
      ],
    }),
  });

  const bundle = await runWithEvidence({
    runId: "bundle-tool-call-first",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.extractions[0].quote, "Beta");
});

test("runWithEvidence falls back to text envelope when tool-call payload is absent", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
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
          },
        },
      ],
    }),
  });

  const bundle = await runWithEvidence({
    runId: "bundle-text-envelope-fallback",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.extractions[0].quote, "Beta");
});

test("runWithEvidence reports partial_success and preserves successful shard extractions", async () => {
  const program = await buildProgram();
  const multiShardText = "Alpha Beta";
  const shards = await chunkDocument(multiShardText, program.programHash, {
    documentId: "doc-partial-success",
    chunkSize: 6,
    overlap: 0,
    offsetMode: "utf16_code_unit",
  });

  const responses: Record<string, string> = {};
  for (let index = 0; index < shards.length; index += 1) {
    const request = buildProviderRequest(program, shards[index], "fake-model");
    const requestHash = await hashProviderRequest(request);
    if (index === 1) {
      responses[requestHash] = JSON.stringify({
        extractions: [
          {
            extractionClass: "token",
            quote: "Beta",
            span: {
              offsetMode: "utf16_code_unit",
              charStart: 0,
              charEnd: 4,
            },
            grounding: "explicit",
          },
        ],
      });
    }
  }

  const bundle = await runWithEvidence({
    runId: "bundle-partial-success",
    program,
    document: {
      documentId: "doc-partial-success",
      text: multiShardText,
    },
    provider: new FakeProvider({
      responses,
      defaultResponse: "I cannot provide JSON for this request.",
    }),
    model: "fake-model",
    chunkSize: 6,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.diagnostics.emptyResultKind, "non_empty");
  assertEqual(bundle.diagnostics.runCompleteness.kind, "partial_success");
  assertEqual(bundle.diagnostics.runCompleteness.totalShards, 2);
  assertEqual(bundle.diagnostics.runCompleteness.successfulShards, 1);
  assertEqual(bundle.diagnostics.runCompleteness.failedShards, 1);
  assertEqual(bundle.diagnostics.failures.length, 1);
});

test("runWithEvidence classifies empty partial runs as empty_by_failure", async () => {
  const program = await buildProgram();
  const multiShardText = "Alpha Beta";
  const shards = await chunkDocument(multiShardText, program.programHash, {
    documentId: "doc-partial-empty-failure",
    chunkSize: 6,
    overlap: 0,
    offsetMode: "utf16_code_unit",
  });

  const responses: Record<string, string> = {};
  for (let index = 0; index < shards.length; index += 1) {
    const request = buildProviderRequest(program, shards[index], "fake-model");
    const requestHash = await hashProviderRequest(request);
    if (index === 0) {
      responses[requestHash] = '{"extractions":[]}';
    }
  }

  const bundle = await runWithEvidence({
    runId: "bundle-partial-empty-failure",
    program,
    document: {
      documentId: "doc-partial-empty-failure",
      text: multiShardText,
    },
    provider: new FakeProvider({
      responses,
      defaultResponse: "I cannot provide JSON for this request.",
    }),
    model: "fake-model",
    chunkSize: 6,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 0);
  assertEqual(bundle.diagnostics.emptyResultKind, "empty_by_failure");
  assertEqual(bundle.diagnostics.runCompleteness.kind, "partial_success");
  assertEqual(bundle.diagnostics.runCompleteness.totalShards, 2);
  assertEqual(bundle.diagnostics.runCompleteness.successfulShards, 1);
  assertEqual(bundle.diagnostics.runCompleteness.failedShards, 1);
  assertEqual(bundle.diagnostics.failures.length, 1);
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
    bundle.diagnostics.shardOutcomes[0].status !== "failure" ||
      bundle.diagnostics.shardOutcomes[0].failure.kind === "budget_exhausted",
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
  assertEqual(
    first.diagnostics.budgetLog.repair.candidateCharsTruncatedCount,
    0,
  );
  assertEqual(first.diagnostics.budgetLog.repair.repairCharsTruncatedCount, 1);
  assertEqual(first.diagnostics.repairLog.entries.length, 1);
  assertEqual(first.diagnostics.repairLog.entries[0].budget.maxRepairChars, 24);
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
  const badDraft = '{"items":[]}';
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
  const repairRequest = buildRepairProviderRequest(
    program,
    shard,
    "fake-model",
    {
      previousResponseText: badDraft,
      failureKind: "payload_shape_failure",
      failureMessage:
        "Provider response must be an array or object with `extractions` array.",
      priorPass: 1,
    },
  );
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
  const repairRequest = buildRepairProviderRequest(
    program,
    shard,
    "fake-model",
    {
      previousResponseText: badDraft,
      failureKind: "quote_invariant_failure",
      failureMessage:
        "Extraction quote does not match the document slice at span.",
      priorPass: 1,
    },
  );
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
      stage.stage === "repair" &&
      stage.failureKind === "quote_invariant_failure"
    ),
    true,
  );
});

test("runWithEvidence maps top-level extraction offsets and mirrors span fields", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      extractions: [
        {
          extractionClass: "token",
          quote: "Beta",
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
          grounding: "explicit",
        },
      ],
    }),
  });

  const bundle = await runWithEvidence({
    runId: "bundle-top-level-offsets",
    program,
    document: {
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 1);
  assertEqual(bundle.extractions[0].offsetMode, "utf16_code_unit");
  assertEqual(bundle.extractions[0].charStart, 6);
  assertEqual(bundle.extractions[0].charEnd, 10);
  assertEqual(bundle.extractions[0].span.charStart, 6);
  assertEqual(bundle.extractions[0].span.charEnd, 10);
});

test("runWithEvidence rejects mismatched top-level and span extraction offsets", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: JSON.stringify({
      extractions: [
        {
          extractionClass: "token",
          quote: "Beta",
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
          span: {
            offsetMode: "utf16_code_unit",
            charStart: 0,
            charEnd: 4,
          },
          grounding: "explicit",
        },
      ],
    }),
  });

  const bundle = await runWithEvidence({
    runId: "bundle-mismatch-offsets",
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
  assertEqual(bundle.diagnostics.failures[0].kind, "payload_shape_failure");
  assertEqual(
    bundle.diagnostics.failures[0].message,
    "Extraction offset fields must match between top-level and span.",
  );
});
