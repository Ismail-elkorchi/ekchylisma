import { sha256Hex } from "../../src/core/hash.ts";
import { runExtractionWithProvider } from "../../src/engine/run.ts";
import { JsonPipelineFailure } from "../../src/json/pipeline.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
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

function extractionPayload(withAttributes = false): string {
  return JSON.stringify({
    extractions: [
      {
        extractionClass: "token",
        quote: "Beta",
        span: {
          offsetMode: "utf16_code_unit",
          charStart: 6,
          charEnd: 10,
        },
        ...(withAttributes ? { attributes: { raw: "ab" } } : {}),
        grounding: "explicit",
      },
    ],
  });
}

test("engine pipeline parses fenced JSON payloads from provider", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: `Assistant output:
\`\`\`json
${extractionPayload()}
\`\`\`
`,
  });

  const result = await runExtractionWithProvider({
    runId: "pipeline-fenced",
    program,
    documentText,
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, "Beta");
  assertEqual(result.jsonPipelineLogs.length, 1);
  assertEqual(result.jsonPipelineLogs[0].pipeline.extractedJson.found, true);
  assertEqual(result.jsonPipelineLogs[0].pipeline.parse.ok, true);
});

test("engine pipeline repairs trailing commas and trailing prose", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: `Here is the extraction:
{"extractions":[{"extractionClass":"token","quote":"Beta","span":{"offsetMode":"utf16_code_unit","charStart":6,"charEnd":10},"grounding":"explicit"},]}
Thanks.`,
  });

  const result = await runExtractionWithProvider({
    runId: "pipeline-trailing-junk",
    program,
    documentText,
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(result.extractions.length, 1);
  assertEqual(result.jsonPipelineLogs[0].pipeline.parse.ok, true);
  assertEqual(
    result.jsonPipelineLogs[0].pipeline.repair.steps.some(
      (step) => step.step === "fixTrailingCommas" && step.applied,
    ),
    true,
  );
});

test("engine pipeline repairs invalid control chars before strict parse", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse:
      '{"extractions":[{"extractionClass":"token","quote":"Beta","span":{"offsetMode":"utf16_code_unit","charStart":6,"charEnd":10},"attributes":{"raw":"a\u0001b"},"grounding":"explicit"}]}',
  });

  const result = await runExtractionWithProvider({
    runId: "pipeline-control-chars",
    program,
    documentText,
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(result.extractions.length, 1);
  assertEqual(
    (result.extractions[0].attributes as { raw?: string }).raw,
    "ab",
  );
  assertEqual(
    result.jsonPipelineLogs[0].pipeline.repair.steps.some(
      (step) => step.step === "removeAsciiControlChars" && step.applied,
    ),
    true,
  );
});

test("engine pipeline reports refusal-like non-json text as explicit parse failure", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: "I cannot provide JSON for this request.",
  });

  await assertRejects(
    () =>
      runExtractionWithProvider({
        runId: "pipeline-refusal",
        program,
        documentText,
        provider,
        model: "fake-model",
        chunkSize: 64,
        overlap: 0,
      }),
    (error) => {
      if (!(error instanceof JsonPipelineFailure)) {
        return false;
      }

      assertEqual(error.log.extractedJson.found, false);
      assertEqual(error.log.parse.ok, false);
      return true;
    },
  );
});

test("engine pipeline decodes streamed SSE frames with JSON fragments", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: [
      "event: message",
      'data: {"choices":[{"delta":{"content":"{\\"extractions\\":["}}]}',
      'data: {"choices":[{"delta":{"content":"{\\"extractionClass\\":\\"token\\",\\"quote\\":\\"Beta\\",\\"span\\":{\\"offsetMode\\":\\"utf16_code_unit\\",\\"charStart\\":6,\\"charEnd\\":10},\\"grounding\\":\\"explicit\\"}"}}]}',
      'data: {"choices":[{"delta":{"content":"]}"}}]}',
      "data: [DONE]",
    ].join("\n"),
  });

  const result = await runExtractionWithProvider({
    runId: "pipeline-streamed-frames",
    program,
    documentText,
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, "Beta");
  assertEqual(result.jsonPipelineLogs[0].pipeline.extractedJson.found, true);
  assertEqual(result.jsonPipelineLogs[0].pipeline.parse.ok, true);
});

test("engine pipeline reports deterministic parse error on malformed streamed frame", async () => {
  const program = await buildProgram();
  const provider = new FakeProvider({
    defaultResponse: [
      "event: message",
      'data: {"choices":[{"delta":{"content":"{\\"extractions\\":["}}]}',
      'data: {"choices":[{"delta":{"content":"broken"}}',
    ].join("\n"),
  });

  await assertRejects(
    () =>
      runExtractionWithProvider({
        runId: "pipeline-streamed-malformed",
        program,
        documentText,
        provider,
        model: "fake-model",
        chunkSize: 64,
        overlap: 0,
      }),
    (error) => {
      if (!(error instanceof JsonPipelineFailure)) {
        return false;
      }
      assertEqual(error.log.parse.ok, false);
      if (error.log.parse.ok) {
        return false;
      }
      assertEqual(
        error.log.parse.error.message,
        "Malformed streamed frame at line 3.",
      );
      return true;
    },
  );
});
