import { readFile } from "node:fs/promises";

type BenchResult = {
  aggregate: {
    successRate: number;
    schemaValidityRate: number;
    quoteInvariantPassRate: number;
    coverageRate: number;
  };
};

function parseArgs(argv: string[]): {
  resultPath: string;
  minSuccessRate: number;
  minSchemaValidityRate: number;
  minQuoteInvariantPassRate: number;
  minCoverageRate: number;
} {
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

  function numeric(name: string, fallback: number): number {
    const raw = args.get(name);
    if (!raw) {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return {
    resultPath: args.get("--result") ?? "bench/results/latest.json",
    minSuccessRate: numeric("--min-success-rate", 1),
    minSchemaValidityRate: numeric("--min-schema-validity-rate", 1),
    minQuoteInvariantPassRate: numeric("--min-quote-invariant-pass-rate", 1),
    minCoverageRate: numeric("--min-coverage-rate", 1),
  };
}

function assertThreshold(
  label: string,
  value: number,
  minimum: number,
): void {
  if (value < minimum) {
    throw new Error(`${label} below threshold: ${value.toFixed(4)} < ${minimum.toFixed(4)}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const source = await readFile(options.resultPath, "utf8");
  const result = JSON.parse(source) as BenchResult;

  assertThreshold(
    "successRate",
    result.aggregate.successRate,
    options.minSuccessRate,
  );
  assertThreshold(
    "schemaValidityRate",
    result.aggregate.schemaValidityRate,
    options.minSchemaValidityRate,
  );
  assertThreshold(
    "quoteInvariantPassRate",
    result.aggregate.quoteInvariantPassRate,
    options.minQuoteInvariantPassRate,
  );
  assertThreshold(
    "coverageRate",
    result.aggregate.coverageRate,
    options.minCoverageRate,
  );

  console.log(
    [
      `bench score passed: ${options.resultPath}`,
      `successRate=${result.aggregate.successRate.toFixed(4)}`,
      `schemaValidityRate=${result.aggregate.schemaValidityRate.toFixed(4)}`,
      `quoteInvariantPassRate=${result.aggregate.quoteInvariantPassRate.toFixed(4)}`,
      `coverageRate=${result.aggregate.coverageRate.toFixed(4)}`,
    ].join(" | "),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
