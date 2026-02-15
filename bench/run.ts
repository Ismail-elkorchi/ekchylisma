import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assertQuoteInvariant } from "../src/core/invariants.ts";
import { sha256Hex } from "../src/core/hash.ts";
import {
  buildProviderRequest,
  buildRepairProviderRequest,
  runWithEvidence,
} from "../src/engine/run.ts";
import { chunkDocument } from "../src/engine/chunk.ts";
import { FakeProvider, hashProviderRequest } from "../src/providers/fake.ts";
import {
  loadRegressionDataset,
  type RegressionDatasetCase,
} from "./regressionDataset.ts";

type GoldSpan = {
  extractionClass: string;
  quote: string;
  charStart: number;
  charEnd: number;
};

type SmokeDatasetCase = {
  caseId: string;
  documentText: string;
  instructions: string;
  targetSchema: Record<string, unknown>;
  providerResponseText: string;
  goldSpans: GoldSpan[];
};

type RunOptions = {
  smokeDatasetPath: string;
  regressionDatasetPath: string;
  outputPath: string;
  mode: "deterministic" | "variance";
  trials: number;
};

type CaseResult = {
  dataset: "smoke" | "regression";
  caseId: string;
  extractionCount: number;
  success: boolean;
  schemaValidityRate: number;
  quoteInvariantPassRate: number;
  coverageRate: number;
  failures: number;
  emptyResultKind: "non_empty" | "empty_by_evidence" | "empty_by_failure";
};

type TrialResult = {
  trialIndex: number;
  cases: CaseResult[];
  successRate: number;
  schemaValidityRate: number;
  quoteInvariantPassRate: number;
  coverageRate: number;
  extractionCount: number;
};

type MultiPassScript = {
  mode: "multi_pass_v1";
  draft: string;
  repair: string;
  failureKind: "json_pipeline_failure" | "payload_shape_failure" | "quote_invariant_failure";
  failureMessage?: string;
};

type StructuredSplitScript = {
  mode: "structured_split_v1";
  generate: string;
  generateStructured: string;
};

type ProviderScript = MultiPassScript | StructuredSplitScript;

function parseArgs(argv: string[]): RunOptions {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(token, "true");
      continue;
    }
    args.set(token, next);
    index += 1;
  }

  const modeRaw = args.get("--mode") ?? "deterministic";
  const mode = modeRaw === "variance" ? "variance" : "deterministic";
  const trialsRaw = args.get("--trials");
  const trials = trialsRaw ? Number.parseInt(trialsRaw, 10) : 1;

  return {
    smokeDatasetPath: args.get("--smoke-dataset") ?? "bench/datasets/smoke.jsonl",
    regressionDatasetPath: args.get("--regression-dataset")
      ?? "bench/datasets/regression.jsonl",
    outputPath: args.get("--out") ?? "bench/results/latest.json",
    mode,
    trials: Number.isFinite(trials) && trials > 0 ? trials : 1,
  };
}

async function loadSmokeDataset(path: string): Promise<SmokeDatasetCase[]> {
  const source = await readFile(path, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SmokeDatasetCase);
}

function extractionKey(
  extractionClass: string,
  quote: string,
  charStart: number,
  charEnd: number,
): string {
  return `${extractionClass}|${quote}|${charStart}|${charEnd}`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeVariance(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function shapeIsValid(extraction: {
  extractionClass: unknown;
  quote: unknown;
  charStart: unknown;
  charEnd: unknown;
  offsetMode: unknown;
  span: { charStart: unknown; charEnd: unknown; offsetMode: unknown };
}): boolean {
  return typeof extraction.extractionClass === "string"
    && typeof extraction.quote === "string"
    && extraction.offsetMode === "utf16_code_unit"
    && typeof extraction.charStart === "number"
    && typeof extraction.charEnd === "number"
    && typeof extraction.span?.charStart === "number"
    && typeof extraction.span?.charEnd === "number"
    && extraction.span?.offsetMode === "utf16_code_unit"
    && extraction.span.charStart === extraction.charStart
    && extraction.span.charEnd === extraction.charEnd;
}

function defaultFailureMessage(kind: MultiPassScript["failureKind"]): string {
  if (kind === "payload_shape_failure") {
    return "Provider response must be an array or object with `extractions` array.";
  }

  if (kind === "quote_invariant_failure") {
    return "Extraction quote does not match the document slice at span.";
  }

  return "Unexpected non-whitespace character after JSON at position 0";
}

function parseProviderScript(providerResponseText: string): ProviderScript | null {
  let value: unknown;
  try {
    value = JSON.parse(providerResponseText);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.mode === "multi_pass_v1") {
    if (typeof record.draft !== "string" || typeof record.repair !== "string") {
      return null;
    }
    if (
      record.failureKind !== "json_pipeline_failure"
      && record.failureKind !== "payload_shape_failure"
      && record.failureKind !== "quote_invariant_failure"
    ) {
      return null;
    }
    if (record.failureMessage !== undefined && typeof record.failureMessage !== "string") {
      return null;
    }

    return {
      mode: "multi_pass_v1",
      draft: record.draft,
      repair: record.repair,
      failureKind: record.failureKind,
      failureMessage: record.failureMessage,
    };
  }

  if (record.mode === "structured_split_v1") {
    if (typeof record.generate !== "string" || typeof record.generateStructured !== "string") {
      return null;
    }

    return {
      mode: "structured_split_v1",
      generate: record.generate,
      generateStructured: record.generateStructured,
    };
  }

  return null;
}

async function runCase(
  testCase: {
    caseId: string;
    documentText: string;
    instructions: string;
    targetSchema: Record<string, unknown>;
    providerResponseText: string;
  },
  trialIndex: number,
): Promise<{
  extractionCount: number;
  schemaValidityRate: number;
  quoteInvariantPassRate: number;
  failures: number;
  emptyResultKind: "non_empty" | "empty_by_evidence" | "empty_by_failure";
  bundleExtractions: {
    extractionClass: string;
    quote: string;
    charStart: number;
    charEnd: number;
  }[];
}> {
  const programHash = await sha256Hex(
    `${testCase.instructions}:${JSON.stringify(testCase.targetSchema)}`,
  );
  const program = {
    instructions: testCase.instructions,
    examples: [],
    schema: testCase.targetSchema,
    programHash,
  };

  const script = parseProviderScript(testCase.providerResponseText);
  const provider = new FakeProvider({
    defaultResponse: script?.mode === "multi_pass_v1"
      ? script.draft
      : script?.mode === "structured_split_v1"
      ? script.generate
      : testCase.providerResponseText,
    structuredDefaultResponse: script?.mode === "structured_split_v1"
      ? script.generateStructured
      : undefined,
  });

  if (script) {
    const shards = await chunkDocument(testCase.documentText, programHash, {
      documentId: testCase.caseId,
      chunkSize: 8192,
      overlap: 0,
      offsetMode: "utf16_code_unit",
    });

    for (const shard of shards) {
      const draftRequest = buildProviderRequest(program, shard, "fake-model");
      const draftHash = await hashProviderRequest(draftRequest);
      if (script.mode === "multi_pass_v1") {
        provider.setResponse(draftHash, script.draft);
        provider.setStructuredResponse(draftHash, script.draft);

        const repairRequest = buildRepairProviderRequest(
          program,
          shard,
          "fake-model",
          {
            previousResponseText: script.draft,
            failureKind: script.failureKind,
            failureMessage: script.failureMessage ?? defaultFailureMessage(script.failureKind),
            priorPass: 1,
          },
        );
        const repairHash = await hashProviderRequest(repairRequest);
        provider.setResponse(repairHash, script.repair);
        provider.setStructuredResponse(repairHash, script.repair);
      } else {
        provider.setResponse(draftHash, script.generate);
        provider.setStructuredResponse(draftHash, script.generateStructured);
      }
    }
  }

  const bundle = await runWithEvidence({
    runId: `bench-${testCase.caseId}-${trialIndex}`,
    program,
    document: {
      documentId: testCase.caseId,
      text: testCase.documentText,
    },
    provider,
    model: "fake-model",
    chunkSize: 8192,
    overlap: 0,
  });

  let schemaValidCount = 0;
  let quoteInvariantCount = 0;

  for (const extraction of bundle.extractions) {
    if (shapeIsValid(extraction)) {
      schemaValidCount += 1;
    }

    try {
      assertQuoteInvariant(testCase.documentText, extraction);
      quoteInvariantCount += 1;
    } catch {
      // tracked in aggregate rate
    }
  }

  return {
    extractionCount: bundle.extractions.length,
    schemaValidityRate:
      bundle.extractions.length === 0 ? 1 : schemaValidCount / bundle.extractions.length,
    quoteInvariantPassRate:
      bundle.extractions.length === 0 ? 1 : quoteInvariantCount / bundle.extractions.length,
    failures: bundle.diagnostics.failures.length,
    emptyResultKind: bundle.diagnostics.emptyResultKind,
    bundleExtractions: bundle.extractions.map((item) => ({
      extractionClass: item.extractionClass,
      quote: item.quote,
      charStart: item.charStart,
      charEnd: item.charEnd,
    })),
  };
}

async function runTrial(
  smokeDataset: SmokeDatasetCase[],
  regressionDataset: RegressionDatasetCase[],
  trialIndex: number,
): Promise<TrialResult> {
  const caseResults: CaseResult[] = [];

  for (const testCase of smokeDataset) {
    const outcome = await runCase(testCase, trialIndex);

    const goldSet = new Set(
      testCase.goldSpans.map((span) =>
        extractionKey(
          span.extractionClass,
          span.quote,
          span.charStart,
          span.charEnd,
        )),
    );
    const actualSet = new Set(
      outcome.bundleExtractions.map((extraction) =>
        extractionKey(
          extraction.extractionClass,
          extraction.quote,
          extraction.charStart,
          extraction.charEnd,
        )),
    );

    let matchedGold = 0;
    for (const key of goldSet) {
      if (actualSet.has(key)) {
        matchedGold += 1;
      }
    }

    caseResults.push({
      dataset: "smoke",
      caseId: testCase.caseId,
      extractionCount: outcome.extractionCount,
      success: outcome.failures === 0,
      schemaValidityRate: outcome.schemaValidityRate,
      quoteInvariantPassRate: outcome.quoteInvariantPassRate,
      coverageRate: testCase.goldSpans.length === 0 ? 1 : matchedGold / testCase.goldSpans.length,
      failures: outcome.failures,
      emptyResultKind: outcome.emptyResultKind,
    });
  }

  for (const testCase of regressionDataset) {
    const outcome = await runCase(testCase, trialIndex);

    const extractionBoundsMatch = outcome.extractionCount >= testCase.expected.minExtractions
      && outcome.extractionCount <= testCase.expected.maxExtractions;
    const emptyKindMatch = outcome.emptyResultKind === testCase.expected.emptyResultKind;

    let stateSpecificMatch = true;
    if (testCase.expected.emptyResultKind === "empty_by_failure") {
      stateSpecificMatch = outcome.failures > 0 && outcome.extractionCount === 0;
    } else if (testCase.expected.emptyResultKind === "empty_by_evidence") {
      stateSpecificMatch = outcome.failures === 0 && outcome.extractionCount === 0;
    } else {
      stateSpecificMatch = outcome.extractionCount > 0;
    }

    const success = extractionBoundsMatch && emptyKindMatch && stateSpecificMatch;

    caseResults.push({
      dataset: "regression",
      caseId: testCase.caseId,
      extractionCount: outcome.extractionCount,
      success,
      schemaValidityRate: outcome.schemaValidityRate,
      quoteInvariantPassRate: outcome.quoteInvariantPassRate,
      coverageRate: success ? 1 : 0,
      failures: outcome.failures,
      emptyResultKind: outcome.emptyResultKind,
    });
  }

  return {
    trialIndex,
    cases: caseResults,
    successRate: average(caseResults.map((entry) => (entry.success ? 1 : 0))),
    schemaValidityRate: average(caseResults.map((entry) => entry.schemaValidityRate)),
    quoteInvariantPassRate: average(caseResults.map((entry) => entry.quoteInvariantPassRate)),
    coverageRate: average(caseResults.map((entry) => entry.coverageRate)),
    extractionCount: caseResults.reduce((sum, entry) => sum + entry.extractionCount, 0),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const smokeDataset = await loadSmokeDataset(options.smokeDatasetPath);
  let regressionDataset: RegressionDatasetCase[];

  try {
    regressionDataset = await loadRegressionDataset(options.regressionDatasetPath);
  } catch (error) {
    throw new Error(
      `invalid regression dataset (${options.regressionDatasetPath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const trialsTarget = options.mode === "variance" ? Math.max(2, options.trials) : options.trials;
  const trialResults: TrialResult[] = [];

  for (let trialIndex = 0; trialIndex < trialsTarget; trialIndex += 1) {
    trialResults.push(await runTrial(smokeDataset, regressionDataset, trialIndex));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    trials: trialsTarget,
    datasetPaths: {
      smoke: options.smokeDatasetPath,
      regression: options.regressionDatasetPath,
    },
    aggregate: {
      successRate: average(trialResults.map((entry) => entry.successRate)),
      schemaValidityRate: average(trialResults.map((entry) => entry.schemaValidityRate)),
      quoteInvariantPassRate: average(
        trialResults.map((entry) => entry.quoteInvariantPassRate),
      ),
      coverageRate: average(trialResults.map((entry) => entry.coverageRate)),
      extractionCountMean: average(trialResults.map((entry) => entry.extractionCount)),
      extractionCountVariance: computeVariance(
        trialResults.map((entry) => entry.extractionCount),
      ),
    },
    trialsResult: trialResults,
  };

  const outputDir = options.outputPath.slice(0, options.outputPath.lastIndexOf("/"));
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
  }
  await writeFile(options.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `bench run complete: ${options.outputPath} | smokeCases=${smokeDataset.length} | regressionCases=${regressionDataset.length}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
