import {
  decodeJsonlToEvidenceBundles,
  encodeEvidenceBundlesToJsonl,
} from "../../src/io/jsonl.ts";
import { assertEqual, test } from "../harness.ts";

function sampleBundle(runId: string) {
  return {
    bundleVersion: "1" as const,
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
