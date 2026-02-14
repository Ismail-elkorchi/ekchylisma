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
};

export type VarianceReport = {
  runCount: number;
  extractionCounts: number[];
  min: number;
  max: number;
  mean: number;
  stability: number;
};

export type EvalSuiteResult = {
  schemaValidRate: number;
  quoteInvariantRate: number;
  uniqueExtractionStability: number;
  variance: VarianceReport;
  runSummaries: Array<{
    runIndex: number;
    extractionCount: number;
    failures: number;
  }>;
};

function extractionKey(extraction: Extraction): string {
  return [
    extraction.extractionClass,
    extraction.span.charStart,
    extraction.span.charEnd,
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

function shapeIsValid(extraction: Extraction): boolean {
  return typeof extraction.extractionClass === "string"
    && typeof extraction.quote === "string"
    && typeof extraction.span.charStart === "number"
    && typeof extraction.span.charEnd === "number";
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
      chunkSize,
      overlap,
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

  let validShapeCount = 0;
  let validQuoteCount = 0;
  let totalExtractions = 0;

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
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
    let extractionCount = 0;

    for (const testCase of options.dataset) {
      try {
        const runResult = await runExtractionWithProvider({
          runId: `eval-${runIndex}-${testCase.caseId}`,
          program: options.program,
          documentText: testCase.documentText,
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
      } catch {
        failures += 1;
      }
    }

    extractionSets.push(runKeys);
    extractionCounts.push(extractionCount);
    runSummaries.push({
      runIndex,
      extractionCount,
      failures,
    });
  }

  const pairwiseScores: number[] = [];
  for (let left = 0; left < extractionSets.length; left += 1) {
    for (let right = left + 1; right < extractionSets.length; right += 1) {
      pairwiseScores.push(jaccardScore(extractionSets[left], extractionSets[right]));
    }
  }

  const stability = pairwiseScores.length === 0 ? 1 : average(pairwiseScores);

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
    },
    runSummaries,
  };
}
