import { sha256Hex } from "../../src/core/hash.ts";
import { compilePrompt, hashPromptText } from "../../src/engine/promptCompiler.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
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
