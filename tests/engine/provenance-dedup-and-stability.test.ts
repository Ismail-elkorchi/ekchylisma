import { readFile } from "node:fs/promises";
import { sha256Hex } from "../../src/core/hash.ts";
import { normalizeProgram } from "../../src/core/program.ts";
import type { Program } from "../../src/core/types.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import { buildProviderRequest, runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider, hashProviderRequest } from "../../src/providers/fake.ts";
import { assert, assertEqual, test } from "../harness.ts";

type ChunkConfig = {
  chunkSize: number;
  overlap: number;
};

type ProvenanceDedupFixture = {
  signal: string;
  sourceUrl: string;
  documentText: string;
  expectedExtraction: {
    quote: string;
    charStart: number;
    charEnd: number;
  };
  chunkConfigs: [ChunkConfig, ChunkConfig];
};

async function loadFixture(): Promise<ProvenanceDedupFixture> {
  const raw = await readFile(
    "tests/fixtures/provenance-dedup-replays.json",
    "utf8",
  );
  const parsed = JSON.parse(raw) as ProvenanceDedupFixture[];
  assertEqual(parsed.length, 1, "fixture count must remain one");
  return parsed[0];
}

async function buildQuoteAwareProvider(
  program: Program,
  documentId: string,
  documentText: string,
  config: ChunkConfig,
  quote: string,
) {
  const shards = await chunkDocument(documentText, program.programHash, {
    documentId,
    chunkSize: config.chunkSize,
    overlap: config.overlap,
    offsetMode: "utf16_code_unit",
  });
  let duplicateShardHits = 0;
  const responses: Record<string, string> = {};

  for (const shard of shards) {
    const requestHash = await hashProviderRequest(
      buildProviderRequest(program, shard, "fake-model"),
    );
    const localStart = shard.text.indexOf(quote);
    if (localStart < 0) {
      responses[requestHash] = '{"extractions":[]}';
      continue;
    }

    duplicateShardHits += 1;
    responses[requestHash] = JSON.stringify({
      extractions: [
        {
          extractionClass: "token",
          quote,
          span: {
            offsetMode: "utf16_code_unit",
            charStart: localStart,
            charEnd: localStart + quote.length,
          },
          grounding: "explicit",
        },
      ],
    });
  }

  return {
    provider: new FakeProvider({
      defaultResponse: '{"extractions":[]}',
      responses,
    }),
    duplicateShardHits,
  };
}

test("provenance ordering is deterministic by global span and extraction identity", async () => {
  const documentText = "Alpha Beta Gamma";
  const programHash = await sha256Hex("provenance-order");
  const bundle = await runWithEvidence({
    runId: "provenance-order",
    program: {
      instructions: "Extract Beta and Gamma.",
      examples: [],
      schema: { type: "object" },
      programHash,
    },
    document: {
      documentId: "doc-provenance-order",
      text: documentText,
    },
    provider: new FakeProvider({
      defaultResponse: JSON.stringify({
        extractions: [
          {
            extractionClass: "token",
            quote: "Gamma",
            span: {
              offsetMode: "utf16_code_unit",
              charStart: 11,
              charEnd: 16,
            },
            grounding: "explicit",
          },
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
    }),
    model: "fake-model",
    chunkSize: 128,
    overlap: 0,
  });

  assertEqual(bundle.extractions.length, 2);
  assertEqual(bundle.extractions[0].quote, "Beta");
  assertEqual(bundle.extractions[1].quote, "Gamma");
  assertEqual(bundle.extractions[0].charStart, 6);
  assertEqual(bundle.extractions[1].charStart, 11);
});

test("provenance dedup is deterministic across chunk configurations for identical spans", async () => {
  const fixture = await loadFixture();
  assertEqual(
    fixture.sourceUrl,
    "https://github.com/run-llama/llama_index/issues/17439",
  );

  const programHash = await sha256Hex("provenance-dedup");
  const program = await normalizeProgram({
    instructions: "Extract the Beta token.",
    examples: [] as [],
    schema: { type: "object" },
    programHash,
  });

  const [primary, secondary] = fixture.chunkConfigs;
  const documentId = "doc-provenance-dedup";
  const primaryRun = await buildQuoteAwareProvider(
    program,
    documentId,
    fixture.documentText,
    primary,
    fixture.expectedExtraction.quote,
  );
  const secondaryRun = await buildQuoteAwareProvider(
    program,
    documentId,
    fixture.documentText,
    secondary,
    fixture.expectedExtraction.quote,
  );

  assert(
    primaryRun.duplicateShardHits > 1,
    "primary config must hit duplicate shard spans",
  );
  assert(
    secondaryRun.duplicateShardHits > 1,
    "secondary config must hit duplicate shard spans",
  );

  const first = await runWithEvidence({
    runId: "provenance-dedup-primary",
    program,
    document: {
      documentId,
      text: fixture.documentText,
    },
    provider: primaryRun.provider,
    model: "fake-model",
    chunkSize: primary.chunkSize,
    overlap: primary.overlap,
  });
  const second = await runWithEvidence({
    runId: "provenance-dedup-secondary",
    program,
    document: {
      documentId,
      text: fixture.documentText,
    },
    provider: secondaryRun.provider,
    model: "fake-model",
    chunkSize: secondary.chunkSize,
    overlap: secondary.overlap,
  });

  assertEqual(first.extractions.length, 1);
  assertEqual(second.extractions.length, 1);
  assertEqual(first.extractions[0].quote, fixture.expectedExtraction.quote);
  assertEqual(
    first.extractions[0].charStart,
    fixture.expectedExtraction.charStart,
  );
  assertEqual(first.extractions[0].charEnd, fixture.expectedExtraction.charEnd);
  assertEqual(
    JSON.stringify(first.extractions),
    JSON.stringify(second.extractions),
    "deduped provenance output should be stable across chunk configurations",
  );
});
