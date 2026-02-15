export type OffsetMode = "utf16_code_unit";

export type Span = {
  offsetMode: OffsetMode;
  charStart: number;
  charEnd: number;
};

export type Extraction = {
  extractionClass: string;
  quote: string;
  span: Span;
  attributes?: Record<string, unknown>;
  grounding: "explicit" | "inferred";
};

export type JsonSchemaSubset = {
  type?: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, JsonSchemaSubset>;
  items?: JsonSchemaSubset;
  enum?: Array<string | number | boolean | null>;
  const?: string | number | boolean | null;
  required?: string[];
  additionalProperties?: boolean;
  anyOf?: JsonSchemaSubset[];
};

export type ProgramExample = {
  input: string;
  output: Extraction[];
};

export type ProgramClass = {
  name: string;
  attributesSchema?: JsonSchemaSubset;
  allowInferred?: boolean;
};

export type ProgramConstraints = {
  requireExactQuote: boolean;
  forbidOverlap: boolean;
  maxExtractionsPerShard?: number;
};

export type Program = {
  programId: string;
  description: string;
  classes: ProgramClass[];
  constraints: ProgramConstraints;
  instructions: string;
  examples: ProgramExample[];
  schema: JsonSchemaSubset;
  programHash: string;
};

export type ProgramInput = {
  programId?: string;
  description?: string;
  classes?: ProgramClass[];
  constraints?: {
    requireExactQuote?: boolean;
    forbidOverlap?: boolean;
    maxExtractionsPerShard?: number;
  };
  instructions: string;
  examples?: ProgramExample[];
  schema: JsonSchemaSubset;
  programHash?: string;
};

export type DocumentInput = {
  documentId?: string;
  text: string;
  meta?: Record<string, string>;
};

export type NormalizationStepName =
  | "normalizeNewlines"
  | "trimTrailingWhitespacePerLine";

export type NormalizationStep = {
  step: NormalizationStepName;
  mappingStrategy: "not_reversible";
  lossy: boolean;
  beforeLength: number;
  afterLength: number;
};

export type NormalizationLedger = {
  steps: NormalizationStep[];
};

export type EvidenceProvenance = {
  documentId: string;
  textHash: string;
  runtime: {
    name: "node" | "deno" | "bun" | "workers" | "browser";
    version: string;
  };
  createdAt: string;
  programHash: string;
};

export type JsonRepairStepName =
  | "stripBOM"
  | "removeAsciiControlChars"
  | "trimOuterJunk"
  | "fixTrailingCommas";

export type JsonRepairStep = {
  step: JsonRepairStepName;
  applied: boolean;
  beforeLength: number;
  afterLength: number;
};

export type JsonRepairLog = {
  steps: JsonRepairStep[];
  changed: boolean;
  budget: {
    maxCandidateChars: number | null;
    maxRepairChars: number | null;
    candidateCharsTruncated: boolean;
    repairCharsTruncated: boolean;
  };
};

export type JsonParseErrorDetail = {
  name: "JsonParseError";
  message: string;
  position: number | null;
  line: number | null;
  column: number | null;
  snippet: string;
  inputLength: number;
};

export type JsonPipelineDiagnostic = {
  extractedJson: {
    found: boolean;
    start: number | null;
    end: number | null;
    kind: "object" | "array" | null;
    sourceLength: number;
    candidateLength: number;
  };
  repair: JsonRepairLog;
  parse:
    | {
      ok: true;
    }
    | {
      ok: false;
      error: JsonParseErrorDetail;
    };
};

export type ShardFailureKind =
  | "provider_error"
  | "json_pipeline_failure"
  | "payload_shape_failure"
  | "quote_invariant_failure"
  | "budget_exhausted"
  | "unknown_failure";

export type ShardFailure = {
  shardId: string;
  kind: ShardFailureKind;
  message: string;
  retryable: boolean;
  errorName: string;
};

export type ProviderRunRecordSnapshot = {
  provider: string;
  model: string;
  latencyMs: number;
  retries: number;
  requestHash: string;
};

export type ShardOutcome =
  | {
    shardId: string;
    start: number;
    end: number;
    status: "success";
    fromCheckpoint: boolean;
    attempts: number;
    extractions: Extraction[];
    providerRunRecord: ProviderRunRecordSnapshot;
    jsonPipelineLog: JsonPipelineDiagnostic;
  }
  | {
    shardId: string;
    start: number;
    end: number;
    status: "failure";
    fromCheckpoint: boolean;
    attempts: number;
    extractions: [];
    failure: ShardFailure;
  };

export type ShardPlan = {
  chunkSize: number;
  overlap: number;
  shardCount: number;
};

export type EmptyResultKind =
  | "non_empty"
  | "empty_by_evidence"
  | "empty_by_failure";

export type RunCompletenessKind =
  | "complete_success"
  | "partial_success"
  | "complete_failure";

export type RunCompleteness = {
  kind: RunCompletenessKind;
  totalShards: number;
  successfulShards: number;
  failedShards: number;
};

export type PromptHashRecord = {
  shardId: string;
  promptHash: string;
};

export type PromptLog = {
  programHash: string;
  shardPromptHashes: PromptHashRecord[];
};

export type RunBudgets = {
  timeBudgetMs?: number;
  repair?: {
    maxCandidateChars?: number;
    maxRepairChars?: number;
  };
};

export type BudgetLog = {
  time: {
    timeBudgetMs: number | null;
    deadlineReached: boolean;
    startedAtMs: number;
    deadlineAtMs: number | null;
  };
  retry: {
    attempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
  };
  repair: {
    maxCandidateChars: number | null;
    maxRepairChars: number | null;
    candidateCharsTruncatedCount: number;
    repairCharsTruncatedCount: number;
  };
};

export type MultiPassStageName =
  | "draft"
  | "validate"
  | "repair"
  | "finalize";

export type MultiPassStageStatus =
  | "ok"
  | "error";

export type MultiPassStageLog = {
  pass: number;
  stage: MultiPassStageName;
  status: MultiPassStageStatus;
  failureKind: ShardFailureKind | null;
  message: string | null;
};

export type MultiPassShardLog = {
  shardId: string;
  maxPasses: number;
  finalPass: number;
  stages: MultiPassStageLog[];
};

export type MultiPassLog = {
  mode: "draft_validate_repair_finalize";
  maxPasses: number;
  shards: MultiPassShardLog[];
};

export type RunRepairLogEntry = {
  shardId: string;
  pass: number;
  parseOk: boolean;
  changed: boolean;
  appliedSteps: JsonRepairStepName[];
  budget: {
    maxCandidateChars: number | null;
    maxRepairChars: number | null;
    candidateCharsTruncated: boolean;
    repairCharsTruncated: boolean;
  };
};

export type RunRepairLog = {
  entries: RunRepairLogEntry[];
};

export type RunDiagnostics = {
  emptyResultKind: EmptyResultKind;
  runCompleteness: RunCompleteness;
  shardOutcomes: ShardOutcome[];
  failures: ShardFailure[];
  checkpointHits: number;
  promptLog: PromptLog;
  budgetLog: BudgetLog;
  multiPassLog: MultiPassLog;
  repairLog: RunRepairLog;
};

export type EvidenceAttestation = {
  version: "1";
  canonicalization: "ekchylisma-json-c14n-v1";
  algorithm: "HMAC-SHA-256";
  keyId?: string;
  payloadHash: string;
  signature: string;
  signedAt: string;
};

export type EvidenceBundle = {
  bundleVersion: "1";
  runId: string;
  program: Program;
  extractions: Extraction[];
  provenance: EvidenceProvenance;
  normalizationLedger: NormalizationLedger;
  shardPlan: ShardPlan;
  diagnostics: RunDiagnostics;
  attestation?: EvidenceAttestation;
};
