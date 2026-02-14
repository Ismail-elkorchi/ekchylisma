import type { Span } from "../core/types.ts";
import type { DocumentShard } from "./chunk.ts";

export function mapShardSpanToDocument(
  shard: Pick<DocumentShard, "start" | "end">,
  shardSpan: Span,
): Span {
  const shardLength = shard.end - shard.start;

  if (shardSpan.charStart < 0 || shardSpan.charEnd < 0) {
    throw new Error("Shard span bounds must be non-negative.");
  }

  if (shardSpan.charStart > shardSpan.charEnd) {
    throw new Error("Shard span must satisfy charStart <= charEnd.");
  }

  if (shardSpan.charEnd > shardLength) {
    throw new Error("Shard span exceeds shard text bounds.");
  }

  return {
    offsetMode: shardSpan.offsetMode,
    charStart: shard.start + shardSpan.charStart,
    charEnd: shard.start + shardSpan.charEnd,
  };
}
