import { visualizeEvidenceBundle } from "../../src/viz/html.ts";
import { assert, assertEqual, test } from "../harness.ts";

const sampleBundle = {
  bundleVersion: "1" as const,
  runId: "run-viz",
  program: {
    instructions: "Extract token Beta.",
    examples: [],
    schema: { type: "object" },
    programHash: "program-hash",
  },
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
  shardPlan: {
    chunkSize: 64,
    overlap: 0,
    shardCount: 1,
  },
  diagnostics: {
    emptyResultKind: "non_empty" as const,
    shardOutcomes: [
      {
        shardId: "shard-1",
        start: 0,
        end: 10,
        status: "success" as const,
        fromCheckpoint: false,
        attempts: 1,
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
        providerRunRecord: {
          provider: "fake",
          model: "fake-model",
          latencyMs: 0,
          retries: 0,
          requestHash: "request-hash",
        },
        jsonPipelineLog: {
          extractedJson: {
            found: true,
            start: 0,
            end: 18,
            kind: "object" as const,
            sourceLength: 18,
            candidateLength: 18,
          },
          repair: {
            changed: false,
            steps: [],
            budget: {
              maxCandidateChars: null,
              maxRepairChars: null,
              candidateCharsTruncated: false,
              repairCharsTruncated: false,
            },
          },
          parse: {
            ok: true as const,
          },
        },
      },
    ],
    failures: [],
    checkpointHits: 0,
    promptLog: {
      programHash: "program-hash",
      shardPromptHashes: [
        {
          shardId: "shard-1",
          promptHash: "prompt-hash",
        },
      ],
    },
    budgetLog: {
      time: {
        timeBudgetMs: null,
        deadlineReached: false,
        startedAtMs: 0,
        deadlineAtMs: null,
      },
      retry: {
        attempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 8,
        jitterRatio: 0,
      },
      repair: {
        maxCandidateChars: null,
        maxRepairChars: null,
        candidateCharsTruncatedCount: 0,
        repairCharsTruncatedCount: 0,
      },
    },
    multiPassLog: {
      mode: "draft_validate_repair_finalize" as const,
      maxPasses: 2,
      shards: [],
    },
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
