import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assertQuoteInvariant } from "../src/core/invariants.ts";
import { sha256Hex } from "../src/core/hash.ts";
import { runWithEvidence } from "../src/engine/run.ts";
import { FakeProvider } from "../src/providers/fake.ts";

type GoldSpan = {
  extractionClass: string;
  quote: string;
  charStart: number;
  charEnd: number;
};

type DatasetCase = {
  caseId: string;
  documentText: string;
  instructions: string;
  targetSchema: Record<string, unknown>;
  providerResponseText: string;
  goldSpans: GoldSpan[];
};

type RunOptions = {
  datasetPath: string;
  outputPath: string;
  mode: "deterministic" | "variance";
  trials: number;
};

type CaseResult = {
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
    datasetPath: args.get("--dataset") ?? "bench/datasets/smoke.jsonl",
    outputPath: args.get("--out") ?? "bench/results/latest.json",
    mode,
    trials: Number.isFinite(trials) && trials > 0 ? trials : 1,
  };
}

async function loadDataset(path: string): Promise<DatasetCase[]> {
  const source = await readFile(path, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatasetCase);
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
  span: { charStart: unknown; charEnd: unknown };
}): boolean {
  return typeof extraction.extractionClass === "string"
    && typeof extraction.quote === "string"
    && typeof extraction.span?.charStart === "number"
    && typeof extraction.span?.charEnd === "number";
}

async function runTrial(
  dataset: DatasetCase[],
  trialIndex: number,
): Promise<TrialResult> {
  const caseResults: CaseResult[] = [];

  for (const testCase of dataset) {
    const provider = new FakeProvider({
      defaultResponse: testCase.providerResponseText,
    });

    const programHash = await sha256Hex(
      `${testCase.instructions}:${JSON.stringify(testCase.targetSchema)}`,
    );

    const bundle = await runWithEvidence({
      runId: `bench-${testCase.caseId}-${trialIndex}`,
      program: {
        instructions: testCase.instructions,
        examples: [],
        schema: testCase.targetSchema,
        programHash,
      },
      document: {
        documentId: testCase.caseId,
        text: testCase.documentText,
      },
      provider,
      model: "fake-model",
      chunkSize: 512,
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
      bundle.extractions.map((extraction) =>
        extractionKey(
          extraction.extractionClass,
          extraction.quote,
          extraction.span.charStart,
          extraction.span.charEnd,
        )),
    );

    let matchedGold = 0;
    for (const key of goldSet) {
      if (actualSet.has(key)) {
        matchedGold += 1;
      }
    }

    caseResults.push({
      caseId: testCase.caseId,
      extractionCount: bundle.extractions.length,
      success: bundle.diagnostics.failures.length === 0,
      schemaValidityRate:
        bundle.extractions.length === 0 ? 1 : schemaValidCount / bundle.extractions.length,
      quoteInvariantPassRate:
        bundle.extractions.length === 0 ? 1 : quoteInvariantCount / bundle.extractions.length,
      coverageRate:
        testCase.goldSpans.length === 0 ? 1 : matchedGold / testCase.goldSpans.length,
      failures: bundle.diagnostics.failures.length,
      emptyResultKind: bundle.diagnostics.emptyResultKind,
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
  const dataset = await loadDataset(options.datasetPath);
  const trialsTarget = options.mode === "variance" ? Math.max(2, options.trials) : options.trials;

  const trialResults: TrialResult[] = [];
  for (let trialIndex = 0; trialIndex < trialsTarget; trialIndex += 1) {
    trialResults.push(await runTrial(dataset, trialIndex));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    trials: trialsTarget,
    datasetPath: options.datasetPath,
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

  console.log(`bench run complete: ${options.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
