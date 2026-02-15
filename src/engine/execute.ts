import type { DocumentShard } from "./chunk.ts";
import type { RunCompleteness } from "../core/types.ts";
import {
  buildCheckpointKey,
  type CheckpointStore,
} from "./checkpoint.ts";
import {
  computeRetryDelayMs,
  type RetryPolicy,
  shouldRetry,
} from "./retry.ts";

export type ExecuteShardOptions<TValue> = {
  runId: string;
  shards: DocumentShard[];
  checkpointStore: CheckpointStore<TValue>;
  runShard: (shard: DocumentShard) => Promise<TValue>;
  retryPolicy: RetryPolicy;
  isTransientError?: (error: unknown) => boolean;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type ExecuteShardResult<TValue> = Array<{
  shardId: string;
  value: TValue;
  fromCheckpoint: boolean;
}>;

function defaultTransientClassifier(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const transient = (error as { transient?: unknown }).transient;
  return transient === true;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function classifyRunCompleteness(
  totalShards: number,
  failedShards: number,
): RunCompleteness {
  if (!Number.isInteger(totalShards) || totalShards < 0) {
    throw new Error("totalShards must be a non-negative integer.");
  }
  if (!Number.isInteger(failedShards) || failedShards < 0 || failedShards > totalShards) {
    throw new Error("failedShards must be a non-negative integer <= totalShards.");
  }

  const successfulShards = totalShards - failedShards;
  if (failedShards === 0) {
    return {
      kind: "complete_success",
      totalShards,
      successfulShards,
      failedShards,
    };
  }
  if (successfulShards > 0) {
    return {
      kind: "partial_success",
      totalShards,
      successfulShards,
      failedShards,
    };
  }
  return {
    kind: "complete_failure",
    totalShards,
    successfulShards,
    failedShards,
  };
}

export async function executeShardsWithCheckpoint<TValue>(
  options: ExecuteShardOptions<TValue>,
): Promise<ExecuteShardResult<TValue>> {
  const isTransientError =
    options.isTransientError ?? defaultTransientClassifier;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  const results: ExecuteShardResult<TValue> = [];

  for (const shard of options.shards) {
    const checkpointKey = buildCheckpointKey(options.runId, shard.shardId);
    const checkpointValue = await options.checkpointStore.get(checkpointKey);

    if (checkpointValue !== undefined) {
      results.push({
        shardId: shard.shardId,
        value: checkpointValue,
        fromCheckpoint: true,
      });
      continue;
    }

    let attempt = 1;
    while (true) {
      try {
        const value = await options.runShard(shard);
        await options.checkpointStore.set(checkpointKey, value);
        results.push({
          shardId: shard.shardId,
          value,
          fromCheckpoint: false,
        });
        break;
      } catch (error) {
        if (!shouldRetry(error, attempt, options.retryPolicy, isTransientError)) {
          throw error;
        }

        const delay = computeRetryDelayMs(options.retryPolicy, attempt, random());
        if (delay > 0) {
          await sleep(delay);
        }
        attempt += 1;
      }
    }
  }

  return results;
}
