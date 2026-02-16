import {
  FakeProvider,
  runWithEvidence,
  sha256Hex,
} from "../../dist/esm/src/index.js";

const output = document.getElementById("output");

async function main(): Promise<void> {
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

  const bundle = await runWithEvidence({
    runId: "browser-example",
    program,
    document: {
      documentId: "browser-doc",
      text: documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 64,
    overlap: 0,
  });

  if (!output) {
    return;
  }

  output.textContent = JSON.stringify(
    {
      extractionCount: bundle.extractions.length,
      extractions: bundle.extractions,
      emptyResultKind: bundle.diagnostics.emptyResultKind,
    },
    null,
    2,
  );
}

main().catch((error) => {
  if (output) {
    output.textContent = String(error);
  }
});
