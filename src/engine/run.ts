import type { Extraction, Program, Span } from "../core/types.ts";
import { assertQuoteInvariant } from "../core/invariants.ts";
import { chunkDocument } from "./chunk.ts";
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
import { parseJsonStrict } from "../json/parse.ts";
import type { Provider, ProviderRequest } from "../providers/types.ts";
import { isTransientProviderError } from "../providers/errors.ts";

export type EngineRunOptions = {
  runId: string;
  program: Program;
  documentText: string;
  provider: Provider;
  model: string;
  chunkSize: number;
  overlap: number;
  checkpointStore?: CheckpointStore<Extraction[]>;
  retryPolicy?: RetryPolicy;
};

export type EngineRunResult = {
  extractions: Extraction[];
  shardsProcessed: number;
  checkpointHits: number;
};

export function buildProviderRequest(
  program: Program,
  shardText: string,
  model: string,
): ProviderRequest {
  return {
    model,
    prompt: `${program.instructions}\n\nUNTRUSTED DOCUMENT SHARD:\n${shardText}`,
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
    options.checkpointStore ?? new InMemoryCheckpointStore<Extraction[]>();

  const retryPolicy: RetryPolicy =
    options.retryPolicy ?? {
      attempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 8,
      jitterRatio: 0,
    };

  const shardResults: ExecuteShardResult<Extraction[]> =
    await executeShardsWithCheckpoint({
      runId: options.runId,
      shards,
      checkpointStore,
      retryPolicy,
      isTransientError: isTransientProviderError,
      runShard: async (shard) => {
        const request = buildProviderRequest(
          options.program,
          shard.text,
          options.model,
        );
        const response = await options.provider.generate(request);
        const payload = parseJsonStrict(response.text);
        const rawExtractions = parseExtractions(payload);

        return rawExtractions.map((raw) => {
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
      },
    });

  return {
    extractions: shardResults.flatMap((entry) => entry.value),
    shardsProcessed: shardResults.length,
    checkpointHits: shardResults.filter((entry) => entry.fromCheckpoint).length,
  };
}
