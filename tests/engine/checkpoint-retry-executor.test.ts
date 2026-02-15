import { chunkDocument } from "../../src/engine/chunk.ts";
import {
  buildCheckpointKey,
  InMemoryCheckpointStore,
} from "../../src/engine/checkpoint.ts";
import { executeShardsWithCheckpoint } from "../../src/engine/execute.ts";
import {
  computeBackoffMs,
  computeJitterMs,
  computeRetryDelayMs,
} from "../../src/engine/retry.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("retry helpers compute deterministic backoff and jitter", () => {
  const policy = {
    attempts: 4,
    baseDelayMs: 10,
    maxDelayMs: 80,
    jitterRatio: 0.25,
  };

  assertEqual(computeBackoffMs(policy, 1), 10);
  assertEqual(computeBackoffMs(policy, 2), 20);
  assertEqual(computeBackoffMs(policy, 10), 80);
  assertEqual(computeJitterMs(20, 0.5, 0.2), 2);
  assertEqual(computeRetryDelayMs(policy, 2, 0.2), 21);
});

test("executeShardsWithCheckpoint retries transient failures and completes run", async () => {
  const shards = await chunkDocument("abcdefghij", "p-hash", {
    documentId: "doc-1",
    chunkSize: 4,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  const store = new InMemoryCheckpointStore<string>();
  const attemptsByShard = new Map<string, number>();
  const failShardId = shards[1].shardId;

  const result = await executeShardsWithCheckpoint({
    runId: "run-1",
    shards,
    checkpointStore: store,
    retryPolicy: {
      attempts: 4,
      baseDelayMs: 1,
      maxDelayMs: 4,
      jitterRatio: 0,
    },
    random: () => 0,
    sleep: async () => {},
    isTransientError: (error) =>
      typeof error === "object" && error !== null && (error as { transient?: unknown }).transient === true,
    runShard: async (shard) => {
      const count = (attemptsByShard.get(shard.shardId) ?? 0) + 1;
      attemptsByShard.set(shard.shardId, count);

      if (shard.shardId === failShardId && count < 3) {
        const transientError = new Error("transient failure");
        (transientError as Error & { transient: boolean }).transient = true;
        throw transientError;
      }

      return `value:${shard.shardId}`;
    },
  });

  assertEqual(result.length, shards.length);
  assertEqual(attemptsByShard.get(failShardId), 3);
  assert(result.every((entry) => entry.value.startsWith("value:")), "all shards should complete");

  const keys = await store.list("ckpt:v1:run-1:");
  assertEqual(keys.length, shards.length);
});

test("executeShardsWithCheckpoint skips completed shards on rerun", async () => {
  const shards = await chunkDocument("abcdef", "p-hash", {
    documentId: "doc-1",
    chunkSize: 3,
    overlap: 1,
    offsetMode: "utf16_code_unit",
  });

  const store = new InMemoryCheckpointStore<string>();
  let runCount = 0;

  for (const shard of shards) {
    await store.set(buildCheckpointKey("run-2", shard.shardId), `cached:${shard.shardId}`);
  }

  const result = await executeShardsWithCheckpoint({
    runId: "run-2",
    shards,
    checkpointStore: store,
    retryPolicy: {
      attempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 2,
      jitterRatio: 0,
    },
    sleep: async () => {},
    random: () => 0,
    runShard: async () => {
      runCount += 1;
      return "should-not-run";
    },
  });

  assertEqual(runCount, 0);
  assertEqual(result.length, shards.length);
  assert(result.every((entry) => entry.fromCheckpoint), "entries should be checkpoint-backed");
});
