import type {
  DocumentInput,
  EvidenceBundle,
  EvidenceProvenance,
  Extraction,
  JsonPipelineDiagnostic,
  PromptLog,
  Program,
  RunDiagnostics,
  ShardFailure,
  ShardOutcome,
  Span,
} from "../core/types.ts";
import { QuoteInvariantViolation, assertQuoteInvariant } from "../core/invariants.ts";
import { sha256Hex } from "../core/hash.ts";
import { normalizeText } from "../core/normalize.ts";
import { chunkDocument, type DocumentShard } from "./chunk.ts";
import {
  executeShardsWithCheckpoint,
  type ExecuteShardResult,
} from "./execute.ts";
import {
  buildCheckpointKey,
  InMemoryCheckpointStore,
  type CheckpointStore,
} from "./checkpoint.ts";
import {
  computeRetryDelayMs,
  shouldRetry,
  type RetryPolicy,
} from "./retry.ts";
import { mapShardSpanToDocument } from "./mapSpan.ts";
import {
  JsonPipelineFailure,
  parseJsonWithRepairPipeline,
} from "../json/pipeline.ts";
import type {
  Provider,
  ProviderRequest,
  ProviderRunRecord,
} from "../providers/types.ts";
import {
  ProviderError,
  isTransientProviderError,
} from "../providers/errors.ts";
import { compilePrompt, hashPromptText } from "./promptCompiler.ts";

type ShardRunValue = {
  extractions: Extraction[];
  jsonPipelineLog: JsonPipelineDiagnostic;
  providerRunRecord: ProviderRunRecord;
};

type RunShardOptions = {
  program: Program;
  shard: DocumentShard;
  model: string;
  provider: Provider;
  documentText: string;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 2,
  baseDelayMs: 1,
  maxDelayMs: 8,
  jitterRatio: 0,
};

type RuntimeGlobals = typeof globalThis & {
  Bun?: {
    version?: string;
  };
  Deno?: {
    version?: {
      deno?: string;
    };
  };
  WebSocketPair?: unknown;
  navigator?: {
    userAgent?: string;
  };
  process?: {
    versions?: {
      node?: string;
    };
  };
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
  pipeline: JsonPipelineDiagnostic;
};

export type EngineRunResult = {
  extractions: Extraction[];
  shardsProcessed: number;
  checkpointHits: number;
  jsonPipelineLogs: JsonPipelineShardLog[];
};

export type RunWithEvidenceOptions = {
  runId: string;
  program: Program;
  document: DocumentInput;
  provider: Provider;
  model: string;
  chunkSize: number;
  overlap: number;
  checkpointStore?: CheckpointStore<ShardRunValue>;
  retryPolicy?: RetryPolicy;
  normalize?: {
    trimTrailingWhitespacePerLine?: boolean;
  };
  runtime?: EvidenceProvenance["runtime"];
  now?: () => string;
  allOrNothing?: boolean;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function detectRuntime(): EvidenceProvenance["runtime"] {
  const globals = globalThis as RuntimeGlobals;
  const denoVersion = globals.Deno?.version?.deno;
  if (typeof denoVersion === "string" && denoVersion.length > 0) {
    return {
      name: "deno",
      version: denoVersion,
    };
  }

  const bunVersion = globals.Bun?.version;
  if (typeof bunVersion === "string" && bunVersion.length > 0) {
    return {
      name: "bun",
      version: bunVersion,
    };
  }

  const nodeVersion = globals.process?.versions?.node;
  if (typeof nodeVersion === "string" && nodeVersion.length > 0) {
    return {
      name: "node",
      version: nodeVersion,
    };
  }

  if (globals.WebSocketPair !== undefined) {
    return {
      name: "workers",
      version: "unknown",
    };
  }

  const userAgent = globals.navigator?.userAgent;
  if (typeof userAgent === "string" && userAgent.length > 0) {
    return {
      name: "browser",
      version: userAgent,
    };
  }

  return {
    name: "node",
    version: "unknown",
  };
}

function classifyShardFailure(
  shardId: string,
  error: unknown,
): ShardFailure {
  if (error instanceof ProviderError) {
    return {
      shardId,
      kind: "provider_error",
      message: error.message,
      retryable: error.kind === "transient",
      errorName: error.name,
    };
  }

  if (error instanceof JsonPipelineFailure) {
    return {
      shardId,
      kind: "json_pipeline_failure",
      message: error.message,
      retryable: false,
      errorName: error.name,
    };
  }

  if (error instanceof QuoteInvariantViolation) {
    return {
      shardId,
      kind: "quote_invariant_failure",
      message: error.message,
      retryable: false,
      errorName: error.name,
    };
  }

  if (error instanceof Error && error.message.includes("Provider response must be an array")) {
    return {
      shardId,
      kind: "payload_shape_failure",
      message: error.message,
      retryable: false,
      errorName: error.name,
    };
  }

  return {
    shardId,
    kind: "unknown_failure",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    errorName: error instanceof Error ? error.name : "Error",
  };
}

function determineEmptyResultKind(
  extractions: Extraction[],
  failures: ShardFailure[],
): RunDiagnostics["emptyResultKind"] {
  if (extractions.length > 0) {
    return "non_empty";
  }

  if (failures.length > 0) {
    return "empty_by_failure";
  }

  return "empty_by_evidence";
}

async function runShardWithProvider(
  options: RunShardOptions,
): Promise<ShardRunValue> {
  const request = buildProviderRequest(
    options.program,
    options.shard,
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

    const globalSpan = mapShardSpanToDocument(options.shard, localSpan);
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

  const retryPolicy: RetryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;

  const shardResults: ExecuteShardResult<ShardRunValue> =
    await executeShardsWithCheckpoint({
      runId: options.runId,
      shards,
      checkpointStore,
      retryPolicy,
      isTransientError: isTransientProviderError,
      runShard: (shard) =>
        runShardWithProvider({
          program: options.program,
          shard,
          model: options.model,
          provider: options.provider,
          documentText: options.documentText,
        }),
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

export async function runWithEvidence(
  options: RunWithEvidenceOptions,
): Promise<EvidenceBundle> {
  const normalized = normalizeText(options.document.text, {
    trimTrailingWhitespacePerLine: options.normalize?.trimTrailingWhitespacePerLine,
  });
  const textHash = await sha256Hex(options.document.text);
  const documentId = options.document.documentId ?? `doc-${textHash.slice(0, 16)}`;
  const runtime = options.runtime ?? detectRuntime();
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const checkpointStore =
    options.checkpointStore ?? new InMemoryCheckpointStore<ShardRunValue>();
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  const shards = await chunkDocument(
    normalized.text,
    options.program.programHash,
    {
      chunkSize: options.chunkSize,
      overlap: options.overlap,
    },
  );

  const shardOutcomes: ShardOutcome[] = [];
  const failures: ShardFailure[] = [];
  const promptLog: PromptLog = {
    programHash: options.program.programHash,
    shardPromptHashes: [],
  };

  for (const shard of shards) {
    const promptHash = await hashPromptText(compilePrompt(options.program, shard));
    promptLog.shardPromptHashes.push({
      shardId: shard.shardId,
      promptHash,
    });

    const checkpointKey = buildCheckpointKey(options.runId, shard.shardId);
    const checkpointValue = await checkpointStore.get(checkpointKey);

    if (checkpointValue !== undefined) {
      shardOutcomes.push({
        shardId: shard.shardId,
        start: shard.start,
        end: shard.end,
        status: "success",
        fromCheckpoint: true,
        attempts: 0,
        extractions: checkpointValue.extractions,
        providerRunRecord: checkpointValue.providerRunRecord,
        jsonPipelineLog: checkpointValue.jsonPipelineLog,
      });
      continue;
    }

    let attempt = 1;
    while (true) {
      try {
        const shardValue = await runShardWithProvider({
          program: options.program,
          shard,
          model: options.model,
          provider: options.provider,
          documentText: normalized.text,
        });

        await checkpointStore.set(checkpointKey, shardValue);
        shardOutcomes.push({
          shardId: shard.shardId,
          start: shard.start,
          end: shard.end,
          status: "success",
          fromCheckpoint: false,
          attempts: attempt,
          extractions: shardValue.extractions,
          providerRunRecord: shardValue.providerRunRecord,
          jsonPipelineLog: shardValue.jsonPipelineLog,
        });
        break;
      } catch (error) {
        if (shouldRetry(error, attempt, retryPolicy, isTransientProviderError)) {
          const delay = computeRetryDelayMs(retryPolicy, attempt, random());
          if (delay > 0) {
            await sleep(delay);
          }
          attempt += 1;
          continue;
        }

        const failure = classifyShardFailure(shard.shardId, error);
        failures.push(failure);
        shardOutcomes.push({
          shardId: shard.shardId,
          start: shard.start,
          end: shard.end,
          status: "failure",
          fromCheckpoint: false,
          attempts: attempt,
          extractions: [],
          failure,
        });

        if (options.allOrNothing) {
          throw error;
        }
        break;
      }
    }
  }

  const extractions = shardOutcomes.flatMap((outcome) => outcome.extractions);
  const diagnostics: RunDiagnostics = {
    emptyResultKind: determineEmptyResultKind(extractions, failures),
    shardOutcomes,
    failures,
    checkpointHits: shardOutcomes.filter((outcome) => outcome.fromCheckpoint).length,
    promptLog,
  };

  return {
    bundleVersion: "1",
    runId: options.runId,
    program: options.program,
    extractions,
    provenance: {
      documentId,
      textHash,
      runtime,
      createdAt: options.now ? options.now() : new Date().toISOString(),
      programHash: options.program.programHash,
    },
    normalizationLedger: normalized.ledger,
    shardPlan: {
      chunkSize: options.chunkSize,
      overlap: options.overlap,
      shardCount: shards.length,
    },
    diagnostics,
  };
}
