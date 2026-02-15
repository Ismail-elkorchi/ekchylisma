import { readFile } from "node:fs/promises";
import { assertQuoteInvariant } from "../../src/core/invariants.ts";
import { chunkDocument } from "../../src/engine/chunk.ts";
import { mapShardSpanToDocument } from "../../src/engine/mapSpan.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

const LONG_DOCUMENT_PATH = "tests/fixtures/long-document.txt";
const LONG_TOKEN = "LONG_FIXTURE_TOKEN_BETA";

async function loadLongDocument(): Promise<string> {
  return readFile(LONG_DOCUMENT_PATH, "utf8");
}

test("long-text fixture chunking remains deterministic", async () => {
  const longText = await loadLongDocument();
  const options = {
    documentId: "long-doc-1",
    chunkSize: 512,
    overlap: 64,
    offsetMode: "utf16_code_unit" as const,
  };

  const first = await chunkDocument(longText, "program-hash-long", options);
  const second = await chunkDocument(longText, "program-hash-long", options);

  assertEqual(JSON.stringify(first), JSON.stringify(second));
  assert(first.length > 30, "fixture should produce many shards");
});

test("long-text fixture span mapping is stable", async () => {
  const longText = await loadLongDocument();
  const shards = await chunkDocument(longText, "program-hash-long", {
    documentId: "long-doc-1",
    chunkSize: 512,
    overlap: 64,
    offsetMode: "utf16_code_unit",
  });

  const targetShard = shards[Math.floor(shards.length / 2)];
  const localStart = 12;
  const localEnd = 40;
  assert(localEnd <= targetShard.text.length, "target shard should contain test span");

  const mapped = mapShardSpanToDocument(targetShard, {
    offsetMode: "utf16_code_unit",
    charStart: localStart,
    charEnd: localEnd,
  });

  assertEqual(
    longText.slice(mapped.charStart, mapped.charEnd),
    targetShard.text.slice(localStart, localEnd),
  );
});

test("long-text fixture enforces quote invariant on grounded token spans", async () => {
  const longText = await loadLongDocument();
  const tokenStart = longText.indexOf(LONG_TOKEN);
  assert(tokenStart >= 0, "fixture token must exist");

  const extraction = {
    extractionClass: "token",
    quote: LONG_TOKEN,
    span: {
      offsetMode: "utf16_code_unit" as const,
      charStart: tokenStart,
      charEnd: tokenStart + LONG_TOKEN.length,
    },
    grounding: "explicit" as const,
  };

  assertQuoteInvariant(longText, extraction);

  await assertRejects(
    () =>
      Promise.resolve(
        assertQuoteInvariant(longText, {
          ...extraction,
          span: {
            ...extraction.span,
            charEnd: extraction.span.charEnd - 1,
          },
        }),
    ),
    (error) => error instanceof Error && error.message.includes("does not match"),
  );
});
