import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REQUIRED_DOCS = [
  "docs/SPEC.md",
  "docs/API.md",
  "docs/ARCHITECTURE.md",
  "docs/DECISIONS.md",
  "docs/OSS_PRACTICES.md",
  "docs/BASELINE_AUDIT.md",
  "docs/PORTABILITY.md",
  "docs/EVAL.md",
  "docs/THREAT_MODEL.md",
  "docs/SECURE_INTEGRATION.md",
  "docs/ROADMAP.md",
  "docs/NON_GOALS.md",
];

type ExampleCheck = {
  label: string;
  command: string;
  args: string[];
  expectedText: string;
};

const EXAMPLE_CHECKS: ExampleCheck[] = [
  {
    label: "node example",
    command: "node",
    args: ["examples/node/basic.ts"],
    expectedText: "\"extractionCount\": 1",
  },
  {
    label: "deno example",
    command: "deno",
    args: ["run", "examples/deno/basic.ts"],
    expectedText: "\"extractionCount\": 1",
  },
  {
    label: "bun example",
    command: "bun",
    args: ["run", "examples/bun/basic.ts"],
    expectedText: "\"extractionCount\": 1",
  },
];

async function ensureFile(path: string): Promise<void> {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new Error(`${path} is not a regular file.`);
  }
}

function collectExportPaths(indexSource: string): string[] {
  const matches = [...indexSource.matchAll(/export \* from "\.\/(.+?)";/g)];
  return matches.map((match) => `src/${match[1]}`).sort();
}

async function verifyContractsReferenced(apiDoc: string): Promise<number> {
  const contractFiles = (await readdir("contracts"))
    .filter((entry) => entry.endsWith(".schema.json"))
    .sort();

  if (contractFiles.length === 0) {
    throw new Error("No contract schemas found in contracts/.");
  }

  const missingReferences = contractFiles.filter(
    (file) => !apiDoc.includes(`contracts/${file}`),
  );

  if (missingReferences.length > 0) {
    throw new Error(
      `Unreferenced contract schema(s): ${missingReferences.join(", ")}. Add them to docs/API.md.`,
    );
  }

  return contractFiles.length;
}

async function verifyExportCoverage(apiDoc: string): Promise<number> {
  const indexSource = await readFile("src/index.ts", "utf8");
  const exportPaths = collectExportPaths(indexSource);

  if (exportPaths.length === 0) {
    throw new Error("No exports found in src/index.ts.");
  }

  const missingExports = exportPaths.filter((path) => !apiDoc.includes(path));
  if (missingExports.length > 0) {
    throw new Error(
      `docs/API.md is missing export path reference(s): ${missingExports.join(
        ", ",
      )}.`,
    );
  }

  return exportPaths.length;
}

async function runExampleSmokes(): Promise<void> {
  for (const check of EXAMPLE_CHECKS) {
    const { stdout } = await execFileAsync(check.command, check.args, {
      timeout: 30_000,
      encoding: "utf8",
    });

    if (!stdout.includes(check.expectedText)) {
      throw new Error(
        `${check.label} output missing expected text: ${check.expectedText}`,
      );
    }
  }

  await ensureFile("examples/workers/worker.ts");
  await ensureFile("examples/browser/index.html");
  await ensureFile("examples/browser/app.ts");
  await ensureFile("bench/README.md");
  await ensureFile("bench/run.ts");
  await ensureFile("bench/score.ts");
  await ensureFile("bench/datasets/smoke.jsonl");
  await ensureFile("bench/results/.gitkeep");
}

async function run(): Promise<void> {
  for (const path of REQUIRED_DOCS) {
    await ensureFile(path);
  }

  const apiDoc = await readFile("docs/API.md", "utf8");
  const contractCount = await verifyContractsReferenced(apiDoc);
  const exportCount = await verifyExportCoverage(apiDoc);
  await runExampleSmokes();

  console.log(
    `orphan-check passed (${contractCount} contracts, ${exportCount} exports, examples smoke-checked).`,
  );
}

run().catch((error) => {
  console.error(
    `orphan-check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
