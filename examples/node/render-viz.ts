import {
  FakeProvider,
  runWithEvidence,
  sha256Hex,
  visualizeEvidenceBundle,
} from "../../src/index.ts";
import { writeTextFile } from "../../src/node/fs.ts";

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
  runId: "viz-example",
  program,
  document: {
    documentId: "example-doc",
    text: documentText,
  },
  provider,
  model: "fake-model",
  chunkSize: 64,
  overlap: 0,
});

const html = visualizeEvidenceBundle([bundle], {
  title: "ekchylisma viz example",
  documentTextById: {
    [bundle.provenance.documentId]: documentText,
  },
});

await writeTextFile("examples/node/evidence.html", html);
console.log("wrote examples/node/evidence.html");
