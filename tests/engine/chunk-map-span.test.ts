import { chunkDocument } from "../../src/engine/chunk.ts";
import { mapShardSpanToDocument } from "../../src/engine/mapSpan.ts";
import type { Span } from "../../src/core/types.ts";
import { assertEqual, assertRejects, test } from "../harness.ts";

test("chunkDocument emits overlapping shards with deterministic boundaries", async () => {
  const text = "abcdefghij";
  const shards = await chunkDocument(text, "program-hash", {
    documentId: "doc-1",
    chunkSize: 5,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  assertEqual(shards.length, 3);
  assertEqual(shards[0].start, 0);
  assertEqual(shards[0].end, 5);
  assertEqual(shards[0].text, "abcde");
  assertEqual(shards[1].start, 4);
  assertEqual(shards[1].end, 9);
  assertEqual(shards[1].text, "efghi");
  assertEqual(shards[2].start, 8);
  assertEqual(shards[2].end, 10);
  assertEqual(shards[2].text, "ij");
  assertEqual(shards[0].shardId.length, 64);
});

test("mapShardSpanToDocument maps shard-local offsets to global offsets", async () => {
  const [first, second] = await chunkDocument("abcdefghij", "program-hash", {
    documentId: "doc-1",
    chunkSize: 6,
    overlap: 2,
    offsetMode: "utf16_code_unit",
  });

  const localSpan: Span = {
    offsetMode: "utf16_code_unit",
    charStart: 1,
    charEnd: 4,
  };

  const mappedFirst = mapShardSpanToDocument(first, localSpan);
  assertEqual(mappedFirst.charStart, 1);
  assertEqual(mappedFirst.charEnd, 4);

  const mappedSecond = mapShardSpanToDocument(second, localSpan);
  assertEqual(mappedSecond.charStart, second.start + 1);
  assertEqual(mappedSecond.charEnd, second.start + 4);
});

test("mapShardSpanToDocument rejects out-of-range spans", async () => {
  const [shard] = await chunkDocument("abcdef", "program-hash", {
    documentId: "doc-1",
    chunkSize: 4,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  await assertRejects(
    () =>
      mapShardSpanToDocument(shard, {
        offsetMode: "utf16_code_unit",
        charStart: 1,
        charEnd: 8,
      }),
    (error) => error instanceof Error && error.message.includes("exceeds"),
  );
});

test("chunkDocument shard ids differ when documentId differs", async () => {
  const text = "abcdefghij";
  const shardsDocA = await chunkDocument(text, "program-hash", {
    documentId: "doc-a",
    chunkSize: 5,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });
  const shardsDocB = await chunkDocument(text, "program-hash", {
    documentId: "doc-b",
    chunkSize: 5,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  assertEqual(shardsDocA[0].shardId === shardsDocB[0].shardId, false);
});

test("chunkDocument shard ids differ when shard parameters differ", async () => {
  const text = "abcdefghij";
  const shardsOverlap0 = await chunkDocument(text, "program-hash", {
    documentId: "doc-1",
    chunkSize: 5,
    overlap: 0,
    offsetMode: "utf16_code_unit",
  });
  const shardsOverlap1 = await chunkDocument(text, "program-hash", {
    documentId: "doc-1",
    chunkSize: 5,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  assertEqual(shardsOverlap0[0].shardId === shardsOverlap1[0].shardId, false);
});
