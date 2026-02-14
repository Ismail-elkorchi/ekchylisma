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
  enum?: Array<string | number | boolean>;
  required?: string[];
};

export type ProgramExample = {
  input: string;
  output: Extraction[];
};

export type Program = {
  instructions: string;
  examples: ProgramExample[];
  schema: JsonSchemaSubset;
  programHash: string;
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

export type EvidenceBundle = {
  bundleVersion: "1";
  extractions: Extraction[];
  provenance: EvidenceProvenance;
  normalizationLedger: NormalizationLedger;
};
