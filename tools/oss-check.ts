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

async function run(): Promise<void> {
  for (const path of [...REQUIRED_ROOT_DOCS, ...REQUIRED_DOCS]) {
    await ensureFile(path);
  }
  for (const path of REQUIRED_CONFIG_FILES) {
    await ensureFile(path);
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  const dependencies = packageJson.dependencies ?? {};
  if (Object.keys(dependencies).length > 0) {
    throw new Error("Runtime dependencies are not allowed: package.json.dependencies must remain empty.");
  }

  const scripts = packageJson.scripts ?? {};
  requireScript(scripts, "oss-check");
  const checkScript = requireScript(scripts, "check");
  if (!checkScript.includes("npm run oss-check")) {
    throw new Error("`npm run check` must include `npm run oss-check`.");
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

  console.log(
    `oss-check passed (${REQUIRED_ROOT_DOCS.length} root docs, ${REQUIRED_DOCS.length} docs entries, ${REQUIRED_CONFIG_FILES.length} config files, ${devDeps.length} dev dependencies verified).`,
  );
}

run().catch((error) => {
  console.error(
    `oss-check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
