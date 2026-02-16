import { readFile } from "node:fs/promises";
import { assert, assertEqual, test } from "../harness.ts";

test("layout: package exports map node subpath to src/node dist artifacts", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    exports?: Record<string, { types?: string; default?: string }>;
  };

  const nodeExport = packageJson.exports?.["./node"];
  assert(nodeExport !== undefined, "./node export must exist");
  assertEqual(nodeExport?.types, "./dist/types/src/node/fs.d.ts");
  assertEqual(nodeExport?.default, "./dist/esm/src/node/fs.js");
});

test("layout: build config includes src/node and removes src-node", async () => {
  const tsconfig = JSON.parse(
    await readFile("tsconfig.build.json", "utf8"),
  ) as {
    include?: string[];
  };
  const includes = tsconfig.include ?? [];

  assert(
    includes.includes("src/node/**/*.ts"),
    "tsconfig include must cover src/node/**/*.ts",
  );
  assert(
    includes.includes("src/node/**/*.d.ts"),
    "tsconfig include must cover src/node/**/*.d.ts",
  );
  assert(
    !includes.includes("src-node/**/*.ts"),
    "tsconfig include must not reference src-node/**/*.ts",
  );
});

test("layout: script entrypoints exist and forward to tool implementations", async () => {
  const entrypoints = [
    ["scripts/pr-body-check.ts", "../tools/pr-body-check.ts"],
    ["scripts/repo-scope-check.ts", "../tools/repo-scope-check.ts"],
    ["scripts/repo-text-check.ts", "../tools/repo-text-check.ts"],
  ] as const;

  for (const [scriptPath, targetPath] of entrypoints) {
    const source = await readFile(scriptPath, "utf8");
    assert(
      source.includes(`import \"${targetPath}\";`),
      `${scriptPath} should forward to ${targetPath}`,
    );
  }
});

test("layout: CI runs PR body check via scripts entrypoint", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  assert(
    workflow.includes("node scripts/pr-body-check.ts"),
    "CI workflow must execute scripts/pr-body-check.ts",
  );
  assert(
    workflow.includes("- run: npm run check"),
    "CI workflow must run npm run check",
  );
});

test("layout: node adapter source path is canonical under src/node", async () => {
  const adapter = await readFile("src/node/fs.ts", "utf8");
  const example = await readFile("examples/node/render-viz.ts", "utf8");

  assert(
    adapter.includes('from "../io/jsonl.ts"'),
    "node adapter should import core codec from src/io",
  );
  assert(
    example.includes('from "../../src/node/fs.ts"'),
    "node example should import canonical src/node adapter path",
  );
});
