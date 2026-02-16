import { sha256Hex } from "../../src/core/hash.ts";
import { runSuite } from "../../src/eval/runSuite.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assertEqual, assertRejects, test } from "../harness.ts";

async function makeProgram() {
  return {
    instructions: "Extract named tokens.",
    examples: [],
    schema: { type: "object" },
    programHash: await sha256Hex("Extract named tokens."),
  };
}

test("runSuite computes deterministic metrics with FakeProvider mode", async () => {
  const program = await makeProgram();

  const result = await runSuite({
    program,
    model: "fake-model",
    runs: 3,
    providerMode: "fake",
    dataset: [
      {
        caseId: "one",
        documentText: "Alpha Beta",
        providerResponseText: JSON.stringify({
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
    ],
  });

  assertEqual(result.schemaValidRate, 1);
  assertEqual(result.quoteInvariantRate, 1);
  assertEqual(result.uniqueExtractionStability, 1);
  assertEqual(result.variance.runCount, 3);
  assertEqual(result.variance.min, 1);
  assertEqual(result.variance.max, 1);
});

test("runSuite requires realProvider in real mode", async () => {
  const program = await makeProgram();

  await assertRejects(
    () =>
      runSuite({
        program,
        model: "fake-model",
        providerMode: "real",
        dataset: [],
      }),
    (error) => error instanceof Error && error.message.includes("realProvider"),
  );

  const result = await runSuite({
    program,
    model: "fake-model",
    providerMode: "real",
    realProvider: new FakeProvider({
      defaultResponse: '{"extractions":[]}',
    }),
    dataset: [],
  });

  assertEqual(result.schemaValidRate, 1);
  assertEqual(result.quoteInvariantRate, 1);
});
