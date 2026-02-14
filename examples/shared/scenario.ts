import { FakeProvider, runWithEvidence, sha256Hex } from "../../src/index.ts";

export async function runPortabilityScenario(runtime: string) {
  const documentText = "Alpha Beta";
  const program = {
    instructions: "Extract token Beta.",
    examples: [],
    schema: { type: "object" },
    programHash: await sha256Hex("Extract token Beta."),
  };

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

  const evidenceBundle = await runWithEvidence({
    runId: `example-${runtime}`,
    program,
    document: {
      documentId: `example-${runtime}-doc`,
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  return {
    runtime,
    extractionCount: evidenceBundle.extractions.length,
    extractions: evidenceBundle.extractions,
    evidenceBundle,
  };
}
