import type { Extraction, Program } from "../core/types.ts";
import { assertQuoteInvariant } from "../core/invariants.ts";
import { buildProviderRequest, runExtractionWithProvider } from "../engine/run.ts";
import { chunkDocument } from "../engine/chunk.ts";
import type { Provider } from "../providers/types.ts";
import { FakeProvider, hashProviderRequest } from "../providers/fake.ts";

export type EvalDatasetCase = {
  caseId: string;
  documentText: string;
  providerResponseText: string;
  providerLabel?: string;
};

export type EvalSuiteOptions = {
  program: Program;
  dataset: EvalDatasetCase[];
  model: string;
  runs?: number;
  chunkSize?: number;
  overlap?: number;
  providerMode?: "fake" | "real";
  realProvider?: Provider;
  promptVariants?: string[];
  seedLabels?: Array<string | number>;
};

export type VarianceReport = {
  runCount: number;
  extractionCounts: number[];
  min: number;
  max: number;
  mean: number;
  stability: number;
  stdDev: number;
  caseOutcomeDriftRate: number;
};

export type BreadthReport = {
  datasetCaseCount: number;
  uniqueCaseIdCount: number;
  providerLabelCount: number;
  promptVariantCount: number;
  seedCount: number;
};

export type EvalSuiteResult = {
  schemaValidRate: number;
  quoteInvariantRate: number;
  uniqueExtractionStability: number;
  variance: VarianceReport;
  breadth: BreadthReport;
  runSummaries: Array<{
    runIndex: number;
    extractionCount: number;
    failures: number;
    promptVariant: string;
    seedLabel: string;
    providerLabel: string;
  }>;
};

function extractionKey(extraction: Extraction): string {
  return [
    extraction.extractionClass,
    extraction.charStart,
    extraction.charEnd,
    extraction.quote,
  ].join("|");
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) {
      intersection += 1;
    }
  }

  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function shapeIsValid(extraction: Extraction): boolean {
  return typeof extraction.extractionClass === "string"
    && typeof extraction.quote === "string"
    && extraction.offsetMode === "utf16_code_unit"
    && typeof extraction.charStart === "number"
    && typeof extraction.charEnd === "number"
    && extraction.span.charStart === extraction.charStart
    && extraction.span.charEnd === extraction.charEnd
    && extraction.span.offsetMode === extraction.offsetMode;
}

function normalizeScheduleLabel(
  labels: Array<string | number> | undefined,
  runIndex: number,
  fallbackPrefix: string,
): string {
  if (!labels || labels.length === 0) {
    return `${fallbackPrefix}-${runIndex}`;
  }

  return String(labels[runIndex % labels.length]);
}

function computeCaseOutcomeDriftRate(caseOutcomesByRun: Array<Map<string, string>>): number {
  if (caseOutcomesByRun.length <= 1) {
    return 0;
  }

  const caseIds = new Set<string>();
  for (const runMap of caseOutcomesByRun) {
    for (const caseId of runMap.keys()) {
      caseIds.add(caseId);
    }
  }

  if (caseIds.size === 0) {
    return 0;
  }

  let drifted = 0;
  for (const caseId of caseIds) {
    const signatures = new Set<string>();

    for (const runMap of caseOutcomesByRun) {
      const signature = runMap.get(caseId) ?? "missing";
      signatures.add(signature);
    }

    if (signatures.size > 1) {
      drifted += 1;
    }
  }

  return drifted / caseIds.size;
}

async function buildFakeProvider(
  program: Program,
  model: string,
  dataset: EvalDatasetCase[],
  chunkSize: number,
  overlap: number,
): Promise<FakeProvider> {
  const provider = new FakeProvider();

  for (const testCase of dataset) {
    const shards = await chunkDocument(testCase.documentText, program.programHash, {
      documentId: testCase.caseId,
      chunkSize,
      overlap,
      offsetMode: "utf16_code_unit",
    });

    for (const shard of shards) {
      const request = buildProviderRequest(program, shard, model);
      const requestHash = await hashProviderRequest(request);
      provider.setResponse(requestHash, testCase.providerResponseText);
    }
  }

  return provider;
}

export async function runSuite(
  options: EvalSuiteOptions,
): Promise<EvalSuiteResult> {
  const runs = options.runs ?? 1;
  const chunkSize = options.chunkSize ?? 10_000;
  const overlap = options.overlap ?? 0;
  const providerMode = options.providerMode ?? "fake";

  if (runs < 1) {
    throw new Error("runs must be >= 1.");
  }

  const extractionSets: Set<string>[] = [];
  const extractionCounts: number[] = [];
  const runSummaries: EvalSuiteResult["runSummaries"] = [];
  const caseOutcomesByRun: Array<Map<string, string>> = [];

  let validShapeCount = 0;
  let validQuoteCount = 0;
  let totalExtractions = 0;

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const promptVariant = normalizeScheduleLabel(options.promptVariants, runIndex, "default");
    const seedLabel = normalizeScheduleLabel(options.seedLabels, runIndex, "seed");

    const provider =
      providerMode === "fake"
        ? await buildFakeProvider(
          options.program,
          options.model,
          options.dataset,
          chunkSize,
          overlap,
        )
        : options.realProvider;

    if (!provider) {
      throw new Error("realProvider must be provided when providerMode is 'real'.");
    }

    let failures = 0;
    const runKeys = new Set<string>();
    const caseOutcomeMap = new Map<string, string>();
    let extractionCount = 0;

    for (const testCase of options.dataset) {
      try {
        const runResult = await runExtractionWithProvider({
          runId: `eval-${runIndex}-${testCase.caseId}`,
          program: options.program,
          documentText: testCase.documentText,
          documentId: testCase.caseId,
          provider,
          model: options.model,
          chunkSize,
          overlap,
        });

        extractionCount += runResult.extractions.length;

        for (const extraction of runResult.extractions) {
          totalExtractions += 1;
          if (shapeIsValid(extraction)) {
            validShapeCount += 1;
          }

          try {
            assertQuoteInvariant(testCase.documentText, extraction);
            validQuoteCount += 1;
          } catch {
            // keep count only
          }

          runKeys.add(extractionKey(extraction));
        }

        const caseSignature = runResult.extractions
          .map((extraction) => extractionKey(extraction))
          .sort()
          .join(";");
        caseOutcomeMap.set(
          testCase.caseId,
          `ok|${runResult.extractions.length}|${caseSignature}`,
        );
      } catch {
        failures += 1;
        caseOutcomeMap.set(testCase.caseId, "error");
      }
    }

    extractionSets.push(runKeys);
    extractionCounts.push(extractionCount);
    caseOutcomesByRun.push(caseOutcomeMap);

    runSummaries.push({
      runIndex,
      extractionCount,
      failures,
      promptVariant,
      seedLabel,
      providerLabel: providerMode === "fake" ? "fake" : "real",
    });
  }

  const pairwiseScores: number[] = [];
  for (let left = 0; left < extractionSets.length; left += 1) {
    for (let right = left + 1; right < extractionSets.length; right += 1) {
      pairwiseScores.push(jaccardScore(extractionSets[left], extractionSets[right]));
    }
  }

  const stability = pairwiseScores.length === 0 ? 1 : average(pairwiseScores);
  const caseOutcomeDriftRate = computeCaseOutcomeDriftRate(caseOutcomesByRun);

  const promptVariantsUsed = new Set(runSummaries.map((summary) => summary.promptVariant));
  const seedsUsed = new Set(runSummaries.map((summary) => summary.seedLabel));
  const providerLabels = new Set(
    options.dataset
      .map((entry) => entry.providerLabel)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  if (providerLabels.size === 0) {
    providerLabels.add(providerMode === "fake" ? "fake" : "real");
  }

  return {
    schemaValidRate: totalExtractions === 0 ? 1 : validShapeCount / totalExtractions,
    quoteInvariantRate: totalExtractions === 0 ? 1 : validQuoteCount / totalExtractions,
    uniqueExtractionStability: stability,
    variance: {
      runCount: runs,
      extractionCounts,
      min: Math.min(...extractionCounts),
      max: Math.max(...extractionCounts),
      mean: average(extractionCounts),
      stability,
      stdDev: standardDeviation(extractionCounts),
      caseOutcomeDriftRate,
    },
    breadth: {
      datasetCaseCount: options.dataset.length,
      uniqueCaseIdCount: new Set(options.dataset.map((entry) => entry.caseId)).size,
      providerLabelCount: providerLabels.size,
      promptVariantCount: promptVariantsUsed.size,
      seedCount: seedsUsed.size,
    },
    runSummaries,
  };
}
