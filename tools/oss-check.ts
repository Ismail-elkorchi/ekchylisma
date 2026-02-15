import { readFile, stat } from "node:fs/promises";

const REQUIRED_ROOT_DOCS = [
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "SUPPORT.md",
  "CHANGELOG.md",
  "RELEASE.md",
];

const REQUIRED_DOCS = [
  "docs/OSS_PRACTICES.md",
  "docs/DEVDEPS.md",
  "docs/DECISIONS.md",
];

const REQUIRED_CONFIG_FILES = [
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
];

const REQUIRED_BENCH_FILES = [
  "bench/README.md",
  "bench/run.ts",
  "bench/score.ts",
  "bench/datasets/smoke.jsonl",
  "bench/results/.gitkeep",
];

const REQUIRED_TOOL_FILES = [
  "tools/pr-body-check.ts",
  "tools/repo-scope-check.ts",
  "tools/repo-text-check.ts",
];

const REQUIRED_SCRIPT_FILES = [
  "scripts/pr-body-check.ts",
  "scripts/repo-scope-check.ts",
  "scripts/repo-text-check.ts",
  "scripts/oss-check.ts",
  "scripts/orphan-check.ts",
];

async function ensureFile(path: string): Promise<void> {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new Error(`${path} is not a regular file.`);
  }
}

function requireScript(
  scripts: Record<string, string>,
  name: string,
): string {
  const value = scripts[name];
  if (!value) {
    throw new Error(`Missing npm script: ${name}`);
  }
  return value;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringValues(entry));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((entry) => collectStringValues(entry));
  }

  return [];
}

async function run(): Promise<void> {
  for (const path of [...REQUIRED_ROOT_DOCS, ...REQUIRED_DOCS]) {
    await ensureFile(path);
  }
  for (const path of REQUIRED_CONFIG_FILES) {
    await ensureFile(path);
  }
  for (const path of REQUIRED_BENCH_FILES) {
    await ensureFile(path);
  }
  for (const path of REQUIRED_TOOL_FILES) {
    await ensureFile(path);
  }
  for (const path of REQUIRED_SCRIPT_FILES) {
    await ensureFile(path);
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    main?: string;
    types?: string;
    files?: string[];
    exports?: Record<string, unknown>;
  };

  const dependencies = packageJson.dependencies ?? {};
  if (Object.keys(dependencies).length > 0) {
    throw new Error("Runtime dependencies are not allowed: package.json.dependencies must remain empty.");
  }

  const scripts = packageJson.scripts ?? {};
  requireScript(scripts, "clean");
  requireScript(scripts, "build");
  requireScript(scripts, "prepack");
  requireScript(scripts, "test:browser");
  requireScript(scripts, "bench:run");
  requireScript(scripts, "bench:score");
  requireScript(scripts, "bench");
  requireScript(scripts, "repo-scope-check");
  requireScript(scripts, "repo-text-check");
  requireScript(scripts, "oss-check");
  const checkScript = requireScript(scripts, "check");
  if (!checkScript.includes("npm run repo-scope-check")) {
    throw new Error("`npm run check` must include `npm run repo-scope-check`.");
  }
  if (!checkScript.includes("npm run repo-text-check")) {
    throw new Error("`npm run check` must include `npm run repo-text-check`.");
  }
  if (!checkScript.includes("npm run oss-check")) {
    throw new Error("`npm run check` must include `npm run oss-check`.");
  }

  if (typeof packageJson.main !== "string" || !packageJson.main.startsWith("./dist/")) {
    throw new Error("package.json.main must point to dist output.");
  }
  if (typeof packageJson.types !== "string" || !packageJson.types.startsWith("./dist/")) {
    throw new Error("package.json.types must point to dist type declarations.");
  }

  const files = packageJson.files ?? [];
  if (!files.includes("dist")) {
    throw new Error("package.json.files must include `dist` for publishable artifacts.");
  }

  const exportsField = packageJson.exports ?? {};
  const exportPaths = collectStringValues(exportsField);
  if (exportPaths.some((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))) {
    throw new Error("package exports must not point to TypeScript source files.");
  }
  if (!exportPaths.some((path) => path.includes("dist/"))) {
    throw new Error("package exports must point to dist output paths.");
  }

  const devDeps = Object.keys(packageJson.devDependencies ?? {});
  const devDepsDoc = await readFile("docs/DEVDEPS.md", "utf8");
  for (const name of devDeps) {
    if (!devDepsDoc.includes(name)) {
      throw new Error(
        `docs/DEVDEPS.md must include an explicit debt entry for devDependency: ${name}`,
      );
    }
  }

  const readme = await readFile("README.md", "utf8");
  for (const doc of REQUIRED_ROOT_DOCS) {
    if (!readme.includes(doc)) {
      throw new Error(`README.md must link to ${doc}.`);
    }
  }

  const dependabotConfig = await readFile(".github/dependabot.yml", "utf8");
  const dependabotEcosystems = dependabotConfig.match(
    /^\s*-\s*package-ecosystem:\s*["'][^"']+["']\s*$/gm,
  ) ?? [];
  if (dependabotEcosystems.length === 0) {
    throw new Error("Dependabot config must define at least one package ecosystem.");
  }

  const dependabotLimitLines = dependabotConfig
    .split("\n")
    .filter((line) => line.includes("open-pull-requests-limit:"));
  if (dependabotLimitLines.length !== dependabotEcosystems.length) {
    throw new Error(
      `Dependabot config must define open-pull-requests-limit for every ecosystem (${dependabotEcosystems.length} expected, ${dependabotLimitLines.length} found).`,
    );
  }

  const invalidDependabotLimitLines = dependabotLimitLines.filter(
    (line) => !/^\s*open-pull-requests-limit:\s*0\s*$/.test(line),
  );
  if (invalidDependabotLimitLines.length > 0) {
    throw new Error(
      `Dependabot open-pull-requests-limit must be 0 for every ecosystem. Invalid line(s): ${invalidDependabotLimitLines.map((line) => line.trim()).join(" | ")}`,
    );
  }

  const ciWorkflow = await readFile(".github/workflows/ci.yml", "utf8");
  if (!ciWorkflow.includes("permissions:")) {
    throw new Error("CI workflow must declare explicit permissions.");
  }
  if (!ciWorkflow.includes("contents: read")) {
    throw new Error("CI workflow permissions must include least-privilege `contents: read`.");
  }

  const usesLines = ciWorkflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- uses: "));
  if (usesLines.length === 0) {
    throw new Error("CI workflow must contain at least one GitHub Action step.");
  }

  for (const line of usesLines) {
    if (!/@[0-9a-f]{40}\b/.test(line)) {
      throw new Error(
        `Workflow action step must be pinned to a full commit SHA: ${line}`,
      );
    }
  }

  if (!ciWorkflow.includes("browser:")) {
    throw new Error("CI workflow must include a browser compatibility job.");
  }
  if (!ciWorkflow.includes("bench:")) {
    throw new Error("CI workflow must include a deterministic benchmark job.");
  }
  if (!ciWorkflow.includes("node scripts/pr-body-check.ts")) {
    throw new Error("CI workflow must run PR body heading validation: node scripts/pr-body-check.ts.");
  }
  if (!ciWorkflow.includes("- run: npm run check")) {
    throw new Error("CI workflow must run `npm run check` in the node job.");
  }

  console.log(
    `oss-check passed (${REQUIRED_ROOT_DOCS.length} root docs, ${REQUIRED_DOCS.length} docs entries, ${REQUIRED_CONFIG_FILES.length} config files, ${REQUIRED_BENCH_FILES.length} bench files, ${devDeps.length} dev dependencies verified).`,
  );
}

run().catch((error) => {
  console.error(
    `oss-check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
