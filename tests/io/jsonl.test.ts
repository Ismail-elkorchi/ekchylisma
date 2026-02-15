import {
  decodeJsonlToEvidenceBundles,
  encodeEvidenceBundlesToJsonl,
} from "../../src/io/jsonl.ts";
import { assertEqual, test } from "../harness.ts";

function sampleBundle(runId: string) {
  return {
    bundleVersion: "1" as const,
    runId: `run-${runId}`,
    program: {
      instructions: "Extract token Beta.",
      examples: [],
      schema: { type: "object" },
      programHash: "program-hash",
    },
    extractions: [],
    provenance: {
      documentId: `doc-${runId}`,
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
      emptyResultKind: "empty_by_evidence" as const,
      shardOutcomes: [
        {
          shardId: `shard-${runId}`,
          start: 0,
          end: 10,
          status: "success" as const,
          fromCheckpoint: false,
          attempts: 1,
          extractions: [],
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
            shardId: `shard-${runId}`,
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
    },
  };
}

test("encodeEvidenceBundlesToJsonl and decodeJsonlToEvidenceBundles roundtrip string input", async () => {
  const bundles = [sampleBundle("1"), sampleBundle("2")];
  const encoded = encodeEvidenceBundlesToJsonl(bundles);

  const decoded = [];
  for await (const bundle of decodeJsonlToEvidenceBundles(encoded)) {
    decoded.push(bundle);
  }

  assertEqual(JSON.stringify(decoded), JSON.stringify(bundles));
});

test("decodeJsonlToEvidenceBundles supports ReadableStream input", async () => {
  const bundles = [sampleBundle("stream")];
  const encoded = encodeEvidenceBundlesToJsonl(bundles);

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(encoded.slice(0, 10));
      controller.enqueue(encoded.slice(10));
      controller.close();
    },
  });

  const decoded = [];
  for await (const bundle of decodeJsonlToEvidenceBundles(stream)) {
    decoded.push(bundle);
  }

  assertEqual(JSON.stringify(decoded), JSON.stringify(bundles));
});
