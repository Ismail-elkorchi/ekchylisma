import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { sha256Hex } from "../../src/core/hash.ts";
import { runWithEvidence } from "../../src/engine/run.ts";
import { FakeProvider } from "../../src/providers/fake.ts";
import { assert, test } from "../harness.ts";

type JsonSchemaNode = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
};

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "tools", "repo-text-check.ts");
const TEMP_DIR = join(REPO_ROOT, "tests", ".tmp-check-pipeline-minimal");

function collectMissingRequiredFields(
  schema: JsonSchemaNode,
  value: unknown,
  path = "root",
): string[] {
  if (
    Array.isArray(schema.type)
      ? !schema.type.includes("object")
      : schema.type !== "object"
  ) {
    if (
      schema.type === "array" && Array.isArray(value) &&
      schema.items !== undefined
    ) {
      return value.flatMap((entry, index) =>
        collectMissingRequiredFields(
          schema.items as JsonSchemaNode,
          entry,
          `${path}[${index}]`,
        )
      );
    }
    return [];
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`${path} is not an object`];
  }

  const objectValue = value as Record<string, unknown>;
  const missing = (schema.required ?? [])
    .filter((field) => !(field in objectValue))
    .map((field) => `${path}.${field}`);
  const nested = Object.entries(schema.properties ?? {}).flatMap(
    ([field, childSchema]) => {
      if (!(field in objectValue)) {
        return [];
      }
      return collectMissingRequiredFields(
        childSchema,
        objectValue[field],
        `${path}.${field}`,
      );
    },
  );

  return [...missing, ...nested];
}

test("repo-text-check rejects internal docs PROGRAM path pattern", async () => {
  const runtimeGlobals = globalThis as { Deno?: unknown; Bun?: unknown };
  if (runtimeGlobals.Deno !== undefined || runtimeGlobals.Bun !== undefined) {
    return;
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(join(TEMP_DIR, "bench", "datasets"), { recursive: true });
  await mkdir(join(TEMP_DIR, "docs"), { recursive: true });

  await writeFile(
    join(TEMP_DIR, "bench", "datasets", "regression.jsonl"),
    `${
      JSON.stringify({
        caseId: "boundary-check--fake-provider--1--1a2b3c4d",
        packId: "2026-02-16--boundary-check--1a2b3c4d",
      })
    }\n`,
    "utf8",
  );
  await writeFile(
    join(TEMP_DIR, "docs", "PROGRAM_INTERNAL.md"),
    "boundary fixture\n",
    "utf8",
  );

  let failedAsExpected = false;
  try {
    await execFileAsync("node", [SCRIPT_PATH], {
      cwd: TEMP_DIR,
      encoding: "utf8",
    });
  } catch (error) {
    const details = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const output = [
      details.stderr ?? "",
      details.stdout ?? "",
      details.message ?? "",
    ].join("\n");
    failedAsExpected = typeof details.code === "number" &&
      details.code !== 0 &&
      output.includes("forbidden path matches policy");
  } finally {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }

  assert(
    failedAsExpected,
    "repo-text-check should reject internal docs PROGRAM pattern",
  );
});

test("evidence bundle schema required-field validation rejects missing diagnostics", async () => {
  const schema = JSON.parse(
    await readFile("contracts/evidence-bundle.schema.json", "utf8"),
  ) as JsonSchemaNode;

  const provider = new FakeProvider({
    defaultResponse:
      '{"extractions":[{"extractionClass":"token","quote":"Beta","span":{"offsetMode":"utf16_code_unit","charStart":6,"charEnd":10},"grounding":"explicit"}]}',
  });
  const programHash = await sha256Hex("Extract token Beta.");
  const bundle = await runWithEvidence({
    runId: "schema-validation-minimal-check",
    program: {
      instructions: "Extract token Beta.",
      examples: [],
      schema: { type: "object" },
      programHash,
    },
    document: {
      documentId: "schema-validation-doc",
      text: "Alpha Beta",
    },
    provider,
    model: "fake-model",
    chunkSize: 8192,
    overlap: 0,
  });

  const validErrors = collectMissingRequiredFields(schema, bundle);
  assert(
    validErrors.length === 0,
    `valid evidence bundle failed schema checks: ${validErrors.join(", ")}`,
  );

  const invalidBundle = { ...bundle } as Record<string, unknown>;
  delete invalidBundle.diagnostics;
  const invalidErrors = collectMissingRequiredFields(schema, invalidBundle);
  assert(
    invalidErrors.includes("root.diagnostics"),
    "missing diagnostics field should violate evidence bundle schema requirements",
  );
});
