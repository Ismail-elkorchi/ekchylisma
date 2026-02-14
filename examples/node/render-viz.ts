import { visualizeEvidenceBundle } from "../../src/viz/html.ts";
import { writeTextFile } from "../../src-node/fs.ts";

const bundle = {
  bundleVersion: "1" as const,
  extractions: [
    {
      extractionClass: "token",
      quote: "Beta",
      span: {
        offsetMode: "utf16_code_unit" as const,
        charStart: 6,
        charEnd: 10,
      },
      grounding: "explicit" as const,
    },
  ],
  provenance: {
    documentId: "example-doc",
    textHash: "hash",
    runtime: {
      name: "node" as const,
      version: "example",
    },
    createdAt: new Date().toISOString(),
    programHash: "example-program",
  },
  normalizationLedger: {
    steps: [],
  },
};

const html = visualizeEvidenceBundle([bundle], {
  title: "ekchylisma viz example",
  documentTextById: {
    "example-doc": "Alpha Beta",
  },
});

await writeTextFile("examples/node/evidence.html", html);
console.log("wrote examples/node/evidence.html");
