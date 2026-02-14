import type { Extraction, Program, Span } from "../core/types.ts";
import { assertQuoteInvariant } from "../core/invariants.ts";
import { chunkDocument, type DocumentShard } from "./chunk.ts";
import {
  executeShardsWithCheckpoint,
  type ExecuteShardResult,
} from "./execute.ts";
import {
  InMemoryCheckpointStore,
  type CheckpointStore,
} from "./checkpoint.ts";
import type { RetryPolicy } from "./retry.ts";
import { mapShardSpanToDocument } from "./mapSpan.ts";
import {
  JsonPipelineFailure,
  parseJsonWithRepairPipeline,
  type JsonPipelineLog,
} from "../json/pipeline.ts";
import type {
  Provider,
  ProviderRequest,
  ProviderRunRecord,
} from "../providers/types.ts";
import { isTransientProviderError } from "../providers/errors.ts";
import { compilePrompt } from "./promptCompiler.ts";

type ShardRunValue = {
  extractions: Extraction[];
  jsonPipelineLog: JsonPipelineLog;
  providerRunRecord: ProviderRunRecord;
};

export type EngineRunOptions = {
  runId: string;
  program: Program;
  documentText: string;
  provider: Provider;
  model: string;
  chunkSize: number;
  overlap: number;
  checkpointStore?: CheckpointStore<ShardRunValue>;
  retryPolicy?: RetryPolicy;
};

export type JsonPipelineShardLog = {
  shardId: string;
  providerRunRecord: ProviderRunRecord;
  pipeline: JsonPipelineLog;
};

export type EngineRunResult = {
  extractions: Extraction[];
  shardsProcessed: number;
  checkpointHits: number;
  jsonPipelineLogs: JsonPipelineShardLog[];
};

export function buildProviderRequest(
  program: Program,
  shard: DocumentShard,
  model: string,
): ProviderRequest {
  return {
    model,
    prompt: compilePrompt(program, shard),
    schema: program.schema,
  };
}

type RawExtraction = {
  extractionClass: string;
  quote: string;
  span: {
    offsetMode?: Span["offsetMode"];
    charStart: number;
    charEnd: number;
  };
  attributes?: Record<string, unknown>;
  grounding?: Extraction["grounding"];
};

function parseExtractions(payload: unknown): RawExtraction[] {
  if (Array.isArray(payload)) {
    return payload as RawExtraction[];
  }

  if (typeof payload === "object" && payload !== null) {
    const extractions = (payload as { extractions?: unknown }).extractions;
    if (Array.isArray(extractions)) {
      return extractions as RawExtraction[];
    }
  }

  throw new Error("Provider response must be an array or object with `extractions` array.");
}

export async function runExtractionWithProvider(
  options: EngineRunOptions,
): Promise<EngineRunResult> {
  const shards = await chunkDocument(
    options.documentText,
    options.program.programHash,
    {
      chunkSize: options.chunkSize,
      overlap: options.overlap,
    },
  );

  const checkpointStore =
    options.checkpointStore ?? new InMemoryCheckpointStore<ShardRunValue>();

  const retryPolicy: RetryPolicy =
    options.retryPolicy ?? {
      attempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 8,
      jitterRatio: 0,
    };

  const shardResults: ExecuteShardResult<ShardRunValue> =
    await executeShardsWithCheckpoint({
      runId: options.runId,
      shards,
      checkpointStore,
      retryPolicy,
      isTransientError: isTransientProviderError,
      runShard: async (shard) => {
        const request = buildProviderRequest(
          options.program,
          shard,
          options.model,
        );
        const response = await options.provider.generate(request);
        const parsed = parseJsonWithRepairPipeline(response.text);
        if (!parsed.ok) {
          throw new JsonPipelineFailure(parsed.error, parsed.log);
        }

        const rawExtractions = parseExtractions(parsed.value);
        const extractions = rawExtractions.map((raw) => {
          const localSpan: Span = {
            offsetMode: raw.span.offsetMode ?? "utf16_code_unit",
            charStart: raw.span.charStart,
            charEnd: raw.span.charEnd,
          };

          const globalSpan = mapShardSpanToDocument(shard, localSpan);
          const extraction: Extraction = {
            extractionClass: raw.extractionClass,
            quote: raw.quote,
            span: globalSpan,
            attributes: raw.attributes,
            grounding: raw.grounding ?? "explicit",
          };

          assertQuoteInvariant(options.documentText, extraction);
          return extraction;
        });

        return {
          extractions,
          jsonPipelineLog: parsed.log,
          providerRunRecord: response.runRecord,
        };
      },
    });

  const jsonPipelineLogs: JsonPipelineShardLog[] = shardResults.map((entry) => ({
    shardId: entry.shardId,
    providerRunRecord: entry.value.providerRunRecord,
    pipeline: entry.value.jsonPipelineLog,
  }));

  return {
    extractions: shardResults.flatMap((entry) => entry.value.extractions),
    shardsProcessed: shardResults.length,
    checkpointHits: shardResults.filter((entry) => entry.fromCheckpoint).length,
    jsonPipelineLogs,
  };
}
