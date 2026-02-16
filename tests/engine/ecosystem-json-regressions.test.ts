import { readFile } from "node:fs/promises";
import { sha256Hex } from "../../src/core/hash.ts";
import { runExtractionWithProvider } from "../../src/engine/run.ts";
import { JsonPipelineFailure } from "../../src/json/pipeline.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

type EcosystemJsonSignalFixture = {
  signal: string;
  sourceUrl: string;
  documentText: string;
  expectedQuote: string;
  expectedCharStart: number;
  expectedCharEnd: number;
  payload: string;
};

async function loadFixtures(): Promise<EcosystemJsonSignalFixture[]> {
  const raw = await readFile(
    "tests/fixtures/ecosystem-json-signals.json",
    "utf8",
  );
  const parsed = JSON.parse(raw) as EcosystemJsonSignalFixture[];
  assertEqual(parsed.length, 4, "fixture count must remain exactly four");
  return parsed;
}

async function findFixture(
  signal: EcosystemJsonSignalFixture["signal"],
): Promise<EcosystemJsonSignalFixture> {
  const fixtures = await loadFixtures();
  const fixture = fixtures.find((entry) => entry.signal === signal);
  if (!fixture) {
    throw new Error(`missing fixture for signal ${signal}`);
  }
  return fixture;
}

async function runFixture(fixture: EcosystemJsonSignalFixture) {
  const programHash = await sha256Hex(`signal:${fixture.signal}`);
  const provider = new FakeProvider({
    defaultResponse: fixture.payload,
  });

  return runExtractionWithProvider({
    runId: `ecosystem-${fixture.signal}`,
    program: {
      instructions: "Extract grounded token mentions.",
      examples: [],
      schema: { type: "object" },
      programHash,
    },
    documentText: fixture.documentText,
    provider,
    model: "fake-model",
    chunkSize: 4096,
    overlap: 0,
  });
}

test("langchain signal: parser recovers by selecting the first schema-valid JSON candidate", async () => {
  const fixture = await findFixture("langchain-parser-brittleness");
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/langchain-ai/langchain/issues/23297",
  );

  const result = await runFixture(fixture);
  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, fixture.expectedQuote);
  assertEqual(result.extractions[0].charStart, fixture.expectedCharStart);
  assertEqual(result.extractions[0].charEnd, fixture.expectedCharEnd);
  assert(
    result.jsonPipelineLogs[0].pipeline.extractedJson.start !== null,
    "candidate offset should be tracked",
  );
  assert(
    (result.jsonPipelineLogs[0].pipeline.extractedJson.start ?? 0) > 0,
    "schema-valid JSON candidate should not be the first malformed object",
  );

  const unrecoverableProvider = new FakeProvider({
    defaultResponse: "I cannot provide a JSON payload.",
  });
  const typedErrorProgramHash = await sha256Hex("signal:langchain-typed-error");
  await assertRejects(
    () =>
      runExtractionWithProvider({
        runId: "ecosystem-langchain-typed-error",
        program: {
          instructions: "Extract grounded token mentions.",
          examples: [],
          schema: { type: "object" },
          programHash: typedErrorProgramHash,
        },
        documentText: fixture.documentText,
        provider: unrecoverableProvider,
        model: "fake-model",
        chunkSize: 4096,
        overlap: 0,
      }),
    (error) =>
      error instanceof JsonPipelineFailure &&
      error.error.failureCode === "json_payload_missing",
  );
});

test("llamaindex signal: parser skips extra-data envelope and keeps deterministic extraction", async () => {
  const fixture = await findFixture("llamaindex-json-extra-data");
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/run-llama/llama_index/issues/14152",
  );

  const result = await runFixture(fixture);
  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, fixture.expectedQuote);
  assertEqual(result.extractions[0].charStart, fixture.expectedCharStart);
  assertEqual(result.extractions[0].charEnd, fixture.expectedCharEnd);
  assert(
    (result.jsonPipelineLogs[0].pipeline.extractedJson.start ?? 0) > 0,
    "parser should advance past the first non-extraction JSON object",
  );
});

test("instructor signal: parser handles tool-call object followed by structured completion payload", async () => {
  const fixture = await findFixture("instructor-tool-completion-json-decode");
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/567-labs/instructor/issues/1380",
  );

  const result = await runFixture(fixture);
  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, fixture.expectedQuote);
  assertEqual(result.extractions[0].charStart, fixture.expectedCharStart);
  assertEqual(result.extractions[0].charEnd, fixture.expectedCharEnd);
  assert(
    (result.jsonPipelineLogs[0].pipeline.extractedJson.start ?? 0) > 0,
    "parser should skip tool-call argument JSON and parse the extraction payload",
  );
});

test("outlines signal: repair pipeline fixes invalid escape sequences and records the salvage step", async () => {
  const fixture = await findFixture("outlines-invalid-escape");
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/dottxt-ai/outlines/issues/759",
  );

  const result = await runFixture(fixture);
  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, fixture.expectedQuote);
  assertEqual(result.extractions[0].charStart, fixture.expectedCharStart);
  assertEqual(result.extractions[0].charEnd, fixture.expectedCharEnd);
  assertEqual(result.jsonPipelineLogs[0].pipeline.repair.changed, true);
  assertEqual(
    result.jsonPipelineLogs[0].pipeline.repair.steps.some((step) =>
      step.step === "fixInvalidEscapes" && step.applied
    ),
    true,
  );
});
