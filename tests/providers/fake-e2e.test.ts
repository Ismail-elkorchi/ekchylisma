import { sha256Hex } from "../../src/core/hash.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import {
  buildProviderRequest,
  runExtractionWithProvider,
} from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import {
  ProviderError,
  classifyProviderStatus,
  isTransientProviderError,
} from "../../src/providers/errors.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("provider error classification distinguishes transient/permanent", () => {
  assertEqual(classifyProviderStatus(429), "transient");
  assertEqual(classifyProviderStatus(400), "permanent");
  assertEqual(isTransientProviderError(new ProviderError("transient", "rate_limit", "retry")), true);
  assertEqual(isTransientProviderError(new ProviderError("permanent", "bad_request", "stop")), false);
});

test("runExtractionWithProvider executes end-to-end with FakeProvider and quote invariant", async () => {
  const documentText = "Alpha Beta";
  const program = {
    instructions: "Extract token Beta.",
    examples: [],
    schema: {
      type: "object",
    },
    programHash: await sha256Hex("Extract token Beta."),
  };

  const [shard] = await chunkDocument(documentText, program.programHash, {
    chunkSize: 32,
    overlap: 0,
  });
  const request = buildProviderRequest(program, shard, "fake-model");
  const requestHash = await hashProviderRequest(request);

  const fakeProvider = new FakeProvider();
  fakeProvider.setResponse(
    requestHash,
    JSON.stringify({
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
  );

  const result = await runExtractionWithProvider({
    runId: "provider-e2e",
    program,
    documentText,
    provider: fakeProvider,
    model: "fake-model",
    chunkSize: 32,
    overlap: 0,
  });

  assertEqual(result.shardsProcessed, 1);
  assertEqual(result.extractions.length, 1);
  assertEqual(result.extractions[0].quote, "Beta");
  assertEqual(result.extractions[0].span.charStart, 6);
  assertEqual(result.extractions[0].span.charEnd, 10);
});
