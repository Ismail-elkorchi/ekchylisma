import { visualizeEvidenceBundle } from "../../src/viz/html.ts";
import { assert, assertEqual, test } from "../harness.ts";

const sampleBundle = {
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
    documentId: "doc-1",
    textHash: "hash",
    runtime: {
      name: "node" as const,
      version: "test",
    },
    createdAt: "2026-02-14T00:00:00.000Z",
    programHash: "program-hash",
  },
  normalizationLedger: {
    steps: [],
  },
};

test("visualizeEvidenceBundle includes html markers and payload", () => {
  const html = visualizeEvidenceBundle([sampleBundle], {
    title: "Viz Test",
    documentTextById: {
      "doc-1": "Alpha Beta",
    },
  });

  assert(html.includes("<script id=\"__ek_data\""), "data payload should be embedded");
  assert(html.includes("BEGIN_UNTRUSTED_DOCUMENT") === false, "viz should not include prompt compiler markers");
  assert(html.includes("Extraction class"), "controls should be rendered");
});

test("visualizeEvidenceBundle renders span indices in initial html", () => {
  const html = visualizeEvidenceBundle([sampleBundle], {
    documentTextById: {
      "doc-1": "Alpha Beta",
    },
  });

  assert(html.includes("[6, 10)"), "span indices should be listed");
  assert(html.includes("data-start=\"6\""), "highlight start index should be present");
  assert(html.includes("data-end=\"10\""), "highlight end index should be present");
  assertEqual(html.includes("<mark class=\"viz-mark\""), true);
});
