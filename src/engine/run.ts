import type {
  BudgetLog,
  DocumentInput,
  EvidenceBundle,
  EvidenceProvenance,
  Extraction,
  JsonPipelineDiagnostic,
  MultiPassLog,
  MultiPassShardLog,
  MultiPassStageLog,
  PromptLog,
  Program,
  RunBudgets,
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
  normalizeRetryPolicy,
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
import {
  compilePrompt,
  compileRepairPrompt,
  hashPromptText,
} from "./promptCompiler.ts";

type ShardRunValue = {
  extractions: Extraction[];
  jsonPipelineLog: JsonPipelineDiagnostic;
  providerRunRecord: ProviderRunRecord;
  multiPassShardLog: MultiPassShardLog;
};

type RunShardOptions = {
  program: Program;
  shard: DocumentShard;
  model: string;
  provider: Provider;
  documentText: string;
  repairBudgets?: RunBudgets["repair"];
  multiPassMaxPasses: number;
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
  documentId?: string;
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
  nowMs?: () => number;
  timeBudgetMs?: number;
  repairBudgets?: RunBudgets["repair"];
  multiPassMaxPasses?: number;
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

export function buildRepairProviderRequest(
  program: Program,
  shard: DocumentShard,
  model: string,
  context: {
    previousResponseText: string;
    failureKind: ShardFailure["kind"];
    failureMessage: string;
    priorPass: number;
  },
): ProviderRequest {
  return {
    model,
    prompt: compileRepairPrompt(program, shard, {
      previousResponseText: context.previousResponseText,
      failureKind: context.failureKind,
      failureMessage: context.failureMessage,
      priorPass: context.priorPass,
    }),
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

class PayloadShapeFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadShapeFailure";
  }
}

class ShardValidationFailure extends Error {
  readonly causeError: unknown;
  readonly multiPassShardLog: MultiPassShardLog;
  readonly jsonPipelineLog: JsonPipelineDiagnostic | null;

  constructor(
    causeError: unknown,
    multiPassShardLog: MultiPassShardLog,
    jsonPipelineLog: JsonPipelineDiagnostic | null,
  ) {
    const message = causeError instanceof Error ? causeError.message : String(causeError);
    super(message);
    this.name = "ShardValidationFailure";
    this.causeError = causeError;
    this.multiPassShardLog = multiPassShardLog;
    this.jsonPipelineLog = jsonPipelineLog;
  }
}

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

  throw new PayloadShapeFailure(
    "Provider response must be an array or object with `extractions` array.",
  );
}

function classifyValidationFailureKind(error: unknown): ShardFailure["kind"] {
  if (error instanceof JsonPipelineFailure) {
    return "json_pipeline_failure";
  }

  if (error instanceof PayloadShapeFailure) {
    return "payload_shape_failure";
  }

  if (error instanceof QuoteInvariantViolation) {
    return "quote_invariant_failure";
  }

  return "unknown_failure";
}

function normalizeMultiPassMaxPasses(value: number | undefined): number {
  if (value === undefined) {
    return 2;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("multiPassMaxPasses must be a positive integer.");
  }

  return value;
}

function isRepairableValidationFailure(error: unknown): boolean {
  const kind = classifyValidationFailureKind(error);
  return kind === "json_pipeline_failure"
    || kind === "payload_shape_failure"
    || kind === "quote_invariant_failure";
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeTimeBudgetMs(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error("timeBudgetMs must be a non-negative integer.");
  }

  return value;
}

function normalizePositiveBudget(
  label: string,
  value: number | undefined,
): number | null {
  if (value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function readClockMs(nowMs: () => number): number {
  const value = nowMs();
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("nowMs must return a non-negative finite number.");
  }

  return Math.floor(value);
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
  const unwrappedError = error instanceof ShardValidationFailure
    ? error.causeError
    : error;

  if (unwrappedError instanceof ProviderError) {
    return {
      shardId,
      kind: "provider_error",
      message: unwrappedError.message,
      retryable: unwrappedError.kind === "transient",
      errorName: unwrappedError.name,
    };
  }

  if (unwrappedError instanceof JsonPipelineFailure) {
    return {
      shardId,
      kind: "json_pipeline_failure",
      message: unwrappedError.message,
      retryable: false,
      errorName: unwrappedError.name,
    };
  }

  if (unwrappedError instanceof PayloadShapeFailure) {
    return {
      shardId,
      kind: "payload_shape_failure",
      message: unwrappedError.message,
      retryable: false,
      errorName: unwrappedError.name,
    };
  }

  if (unwrappedError instanceof QuoteInvariantViolation) {
    return {
      shardId,
      kind: "quote_invariant_failure",
      message: unwrappedError.message,
      retryable: false,
      errorName: unwrappedError.name,
    };
  }

  return {
    shardId,
    kind: "unknown_failure",
    message: unwrappedError instanceof Error ? unwrappedError.message : String(unwrappedError),
    retryable: false,
    errorName: unwrappedError instanceof Error ? unwrappedError.name : "Error",
  };
}

function createBudgetExhaustedFailure(
  shardId: string,
  message: string,
): ShardFailure {
  return {
    shardId,
    kind: "budget_exhausted",
    message,
    retryable: false,
    errorName: "BudgetExhaustedError",
  };
}

function aggregateRepairBudgetHits(
  diagnostic: JsonPipelineDiagnostic,
  counters: {
    candidateCharsTruncatedCount: number;
    repairCharsTruncatedCount: number;
  },
): void {
  if (diagnostic.repair.budget.candidateCharsTruncated) {
    counters.candidateCharsTruncatedCount += 1;
  }
  if (diagnostic.repair.budget.repairCharsTruncated) {
    counters.repairCharsTruncatedCount += 1;
  }
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
  const stages: MultiPassStageLog[] = [];
  let lastFailureKind: ShardFailure["kind"] = "unknown_failure";
  let lastFailureMessage = "Unknown validation failure.";
  let previousResponseText = "";
  let lastJsonPipelineLog: JsonPipelineDiagnostic | null = null;
  let lastError: unknown = new Error("multi-pass execution failed");

  for (let pass = 1; pass <= options.multiPassMaxPasses; pass += 1) {
    const request = pass === 1
      ? buildProviderRequest(
        options.program,
        options.shard,
        options.model,
      )
      : buildRepairProviderRequest(
        options.program,
        options.shard,
        options.model,
        {
          previousResponseText,
          failureKind: lastFailureKind,
          failureMessage: lastFailureMessage,
          priorPass: pass - 1,
        },
      );

    let response: Awaited<ReturnType<Provider["generate"]>>;
    try {
      response = await options.provider.generate(request);
      stages.push({
        pass,
        stage: "draft",
        status: "ok",
        failureKind: null,
        message: null,
      });
    } catch (error) {
      stages.push({
        pass,
        stage: "draft",
        status: "error",
        failureKind: "provider_error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    previousResponseText = response.text;

    try {
      const parsed = parseJsonWithRepairPipeline(response.text, {
        repair: options.repairBudgets,
      });
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

      stages.push({
        pass,
        stage: "validate",
        status: "ok",
        failureKind: null,
        message: null,
      });
      stages.push({
        pass,
        stage: "finalize",
        status: "ok",
        failureKind: null,
        message: null,
      });

      return {
        extractions,
        jsonPipelineLog: parsed.log,
        providerRunRecord: response.runRecord,
        multiPassShardLog: {
          shardId: options.shard.shardId,
          maxPasses: options.multiPassMaxPasses,
          finalPass: pass,
          stages,
        },
      };
    } catch (error) {
      lastError = error;
      lastFailureKind = classifyValidationFailureKind(error);
      lastFailureMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof JsonPipelineFailure) {
        lastJsonPipelineLog = error.log;
      }

      stages.push({
        pass,
        stage: "validate",
        status: "error",
        failureKind: lastFailureKind,
        message: lastFailureMessage,
      });

      const canRepair = pass < options.multiPassMaxPasses
        && isRepairableValidationFailure(error);
      if (canRepair) {
        stages.push({
          pass,
          stage: "repair",
          status: "ok",
          failureKind: lastFailureKind,
          message: "Repair pass scheduled.",
        });
        continue;
      }

      break;
    }
  }

  throw new ShardValidationFailure(
    lastError,
    {
      shardId: options.shard.shardId,
      maxPasses: options.multiPassMaxPasses,
      finalPass: options.multiPassMaxPasses,
      stages,
    },
    lastJsonPipelineLog,
  );
}

export async function runExtractionWithProvider(
  options: EngineRunOptions,
): Promise<EngineRunResult> {
  const documentId = options.documentId
    ?? `doc-${(await sha256Hex(options.documentText)).slice(0, 16)}`;
  const shards = await chunkDocument(
    options.documentText,
    options.program.programHash,
    {
      documentId,
      chunkSize: options.chunkSize,
      overlap: options.overlap,
      offsetMode: "utf16_code_unit",
    },
  );

  const checkpointStore =
    options.checkpointStore ?? new InMemoryCheckpointStore<ShardRunValue>();

  const retryPolicy: RetryPolicy = normalizeRetryPolicy(
    options.retryPolicy ?? DEFAULT_RETRY_POLICY,
  );
  const multiPassMaxPasses = normalizeMultiPassMaxPasses(undefined);

  const shardResults: ExecuteShardResult<ShardRunValue> =
    await executeShardsWithCheckpoint({
      runId: options.runId,
      shards,
      checkpointStore,
      retryPolicy,
      isTransientError: isTransientProviderError,
      runShard: async (shard) => {
        try {
          return await runShardWithProvider({
            program: options.program,
            shard,
            model: options.model,
            provider: options.provider,
            documentText: options.documentText,
            multiPassMaxPasses,
          });
        } catch (error) {
          if (error instanceof ShardValidationFailure) {
            throw error.causeError;
          }
          throw error;
        }
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

export async function runWithEvidence(
  options: RunWithEvidenceOptions,
): Promise<EvidenceBundle> {
  const normalized = normalizeText(options.document.text, {
    trimTrailingWhitespacePerLine: options.normalize?.trimTrailingWhitespacePerLine,
  });
  const textHash = await sha256Hex(options.document.text);
  const documentId = options.document.documentId ?? `doc-${textHash.slice(0, 16)}`;
  const runtime = options.runtime ?? detectRuntime();
  const retryPolicy = normalizeRetryPolicy(options.retryPolicy ?? DEFAULT_RETRY_POLICY);
  const checkpointStore =
    options.checkpointStore ?? new InMemoryCheckpointStore<ShardRunValue>();
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const nowMs = options.nowMs ?? Date.now;
  const multiPassMaxPasses = normalizeMultiPassMaxPasses(options.multiPassMaxPasses);

  const startedAtMs = readClockMs(nowMs);
  const timeBudgetMs = normalizeTimeBudgetMs(options.timeBudgetMs);
  const deadlineAtMs = timeBudgetMs === null ? null : startedAtMs + timeBudgetMs;

  const configuredRepairBudgets = {
    maxCandidateChars: normalizePositiveBudget(
      "repairBudgets.maxCandidateChars",
      options.repairBudgets?.maxCandidateChars,
    ),
    maxRepairChars: normalizePositiveBudget(
      "repairBudgets.maxRepairChars",
      options.repairBudgets?.maxRepairChars,
    ),
  };
  const normalizedRepairBudgets = configuredRepairBudgets.maxCandidateChars === null &&
      configuredRepairBudgets.maxRepairChars === null
    ? undefined
    : {
      maxCandidateChars: configuredRepairBudgets.maxCandidateChars ?? undefined,
      maxRepairChars: configuredRepairBudgets.maxRepairChars ?? undefined,
    };

  let deadlineReached = false;
  const repairBudgetHitCounters = {
    candidateCharsTruncatedCount: 0,
    repairCharsTruncatedCount: 0,
  };

  const budgetLog: BudgetLog = {
    time: {
      timeBudgetMs,
      deadlineReached,
      startedAtMs,
      deadlineAtMs,
    },
    retry: {
      attempts: retryPolicy.attempts,
      baseDelayMs: retryPolicy.baseDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
      jitterRatio: retryPolicy.jitterRatio,
    },
    repair: {
      maxCandidateChars: configuredRepairBudgets.maxCandidateChars,
      maxRepairChars: configuredRepairBudgets.maxRepairChars,
      candidateCharsTruncatedCount: 0,
      repairCharsTruncatedCount: 0,
    },
  };

  function hasReachedDeadline(): boolean {
    return deadlineAtMs !== null && readClockMs(nowMs) >= deadlineAtMs;
  }

  const shards = await chunkDocument(
    normalized.text,
    options.program.programHash,
    {
      documentId,
      chunkSize: options.chunkSize,
      overlap: options.overlap,
      offsetMode: "utf16_code_unit",
    },
  );

  const shardOutcomes: ShardOutcome[] = [];
  const failures: ShardFailure[] = [];
  const multiPassShardLogs: MultiPassShardLog[] = [];
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
      aggregateRepairBudgetHits(
        checkpointValue.jsonPipelineLog,
        repairBudgetHitCounters,
      );
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
      multiPassShardLogs.push(checkpointValue.multiPassShardLog);
      continue;
    }

    if (hasReachedDeadline()) {
      const failure = createBudgetExhaustedFailure(
        shard.shardId,
        "Run time budget exhausted before shard execution.",
      );
      deadlineReached = true;
      failures.push(failure);
      shardOutcomes.push({
        shardId: shard.shardId,
        start: shard.start,
        end: shard.end,
        status: "failure",
        fromCheckpoint: false,
        attempts: 0,
        extractions: [],
        failure,
      });
      multiPassShardLogs.push({
        shardId: shard.shardId,
        maxPasses: multiPassMaxPasses,
        finalPass: 0,
        stages: [
          {
            pass: 0,
            stage: "draft",
            status: "error",
            failureKind: "budget_exhausted",
            message: "Run time budget exhausted before shard execution.",
          },
        ],
      });
      continue;
    }

    let attempt = 1;
    while (true) {
      if (hasReachedDeadline()) {
        const failure = createBudgetExhaustedFailure(
          shard.shardId,
          "Run time budget exhausted before provider attempt.",
        );
        deadlineReached = true;
        failures.push(failure);
        shardOutcomes.push({
          shardId: shard.shardId,
          start: shard.start,
          end: shard.end,
          status: "failure",
          fromCheckpoint: false,
          attempts: Math.max(0, attempt - 1),
          extractions: [],
          failure,
        });
        multiPassShardLogs.push({
          shardId: shard.shardId,
          maxPasses: multiPassMaxPasses,
          finalPass: Math.max(0, attempt - 1),
          stages: [
            {
              pass: Math.max(0, attempt - 1),
              stage: "draft",
              status: "error",
              failureKind: "budget_exhausted",
              message: "Run time budget exhausted before provider attempt.",
            },
          ],
        });
        break;
      }

      try {
        const shardValue = await runShardWithProvider({
          program: options.program,
          shard,
          model: options.model,
          provider: options.provider,
          documentText: normalized.text,
          repairBudgets: normalizedRepairBudgets,
          multiPassMaxPasses,
        });

        aggregateRepairBudgetHits(shardValue.jsonPipelineLog, repairBudgetHitCounters);
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
        multiPassShardLogs.push(shardValue.multiPassShardLog);
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

        if (error instanceof ShardValidationFailure) {
          multiPassShardLogs.push(error.multiPassShardLog);
          if (error.jsonPipelineLog !== null) {
            aggregateRepairBudgetHits(error.jsonPipelineLog, repairBudgetHitCounters);
          }
        } else if (error instanceof JsonPipelineFailure) {
          aggregateRepairBudgetHits(error.log, repairBudgetHitCounters);
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
  budgetLog.time.deadlineReached = deadlineReached || hasReachedDeadline();
  budgetLog.repair.candidateCharsTruncatedCount =
    repairBudgetHitCounters.candidateCharsTruncatedCount;
  budgetLog.repair.repairCharsTruncatedCount =
    repairBudgetHitCounters.repairCharsTruncatedCount;

  const diagnostics: RunDiagnostics = {
    emptyResultKind: determineEmptyResultKind(extractions, failures),
    shardOutcomes,
    failures,
    checkpointHits: shardOutcomes.filter((outcome) => outcome.fromCheckpoint).length,
    promptLog,
    budgetLog,
    multiPassLog: {
      mode: "draft_validate_repair_finalize",
      maxPasses: multiPassMaxPasses,
      shards: multiPassShardLogs,
    },
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
