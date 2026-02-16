import { sha256Hex } from "./hash.ts";
import type {
  Program,
  ProgramClass,
  ProgramConstraints,
  ProgramExample,
  ProgramInput,
} from "./types.ts";
import { normalizeSchemaDialect } from "../schema/normalizeDialect.ts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort((
    [a],
    [b],
  ) => a.localeCompare(b));
  return `{${
    entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")
  }}`;
}

function fail(message: string): never {
  throw new Error(`invalid program: ${message}`);
}

function ensureNonEmptyString(label: string, value: unknown): string {
  if (typeof value !== "string") {
    fail(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(`${label} must be non-empty`);
  }
  return trimmed;
}

function normalizeClasses(
  classes: ProgramInput["classes"],
  examples: ProgramExample[],
): ProgramClass[] {
  const classCandidates = classes && classes.length > 0 ? classes : (() => {
    const exampleClassNames = new Set<string>();
    for (const example of examples) {
      for (const output of example.output) {
        if (
          typeof output.extractionClass === "string" &&
          output.extractionClass.trim().length > 0
        ) {
          exampleClassNames.add(output.extractionClass.trim());
        }
      }
    }
    const names = [...exampleClassNames];
    if (names.length === 0) {
      return [{ name: "extraction", allowInferred: false }];
    }
    return names.map((name) => ({ name, allowInferred: false }));
  })();

  if (!Array.isArray(classCandidates) || classCandidates.length === 0) {
    fail("classes must contain at least one class");
  }

  const seen = new Set<string>();
  const normalized = classCandidates.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail(`classes[${index}] must be an object`);
    }
    const name = ensureNonEmptyString(
      `classes[${index}].name`,
      (entry as { name?: unknown }).name,
    );
    if (seen.has(name)) {
      fail(`classes contains duplicate name: ${name}`);
    }
    seen.add(name);

    const attributesSchema =
      (entry as { attributesSchema?: unknown }).attributesSchema;
    if (
      attributesSchema !== undefined &&
      (typeof attributesSchema !== "object" || attributesSchema === null ||
        Array.isArray(attributesSchema))
    ) {
      fail(
        `classes[${index}].attributesSchema must be an object when provided`,
      );
    }

    const allowInferred = (entry as { allowInferred?: unknown }).allowInferred;
    if (allowInferred !== undefined && typeof allowInferred !== "boolean") {
      fail(`classes[${index}].allowInferred must be boolean when provided`);
    }

    const normalizedEntry: ProgramClass = {
      name,
    };
    if (attributesSchema !== undefined) {
      normalizedEntry.attributesSchema = normalizeSchemaDialect(
        attributesSchema,
      );
    }
    if (allowInferred !== undefined) {
      normalizedEntry.allowInferred = allowInferred;
    }

    return normalizedEntry;
  });

  return normalized;
}

function normalizeConstraints(
  input: ProgramInput["constraints"],
): ProgramConstraints {
  const requireExactQuote = input?.requireExactQuote ?? true;
  const forbidOverlap = input?.forbidOverlap ?? true;
  const maxExtractionsPerShard = input?.maxExtractionsPerShard;

  if (typeof requireExactQuote !== "boolean") {
    fail("constraints.requireExactQuote must be boolean when provided");
  }
  if (typeof forbidOverlap !== "boolean") {
    fail("constraints.forbidOverlap must be boolean when provided");
  }
  if (
    maxExtractionsPerShard !== undefined &&
    (!Number.isInteger(maxExtractionsPerShard) || maxExtractionsPerShard <= 0)
  ) {
    fail(
      "constraints.maxExtractionsPerShard must be a positive integer when provided",
    );
  }

  const normalized: ProgramConstraints = {
    requireExactQuote,
    forbidOverlap,
  };
  if (maxExtractionsPerShard !== undefined) {
    normalized.maxExtractionsPerShard = maxExtractionsPerShard;
  }
  return normalized;
}

function normalizeExamples(
  examples: ProgramInput["examples"],
): ProgramExample[] {
  if (examples === undefined) {
    return [];
  }
  if (!Array.isArray(examples)) {
    fail("examples must be an array");
  }

  return examples.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail(`examples[${index}] must be an object`);
    }
    if (typeof (entry as { input?: unknown }).input !== "string") {
      fail(`examples[${index}].input must be a string`);
    }
    if (!Array.isArray((entry as { output?: unknown }).output)) {
      fail(`examples[${index}].output must be an array`);
    }
    return entry as ProgramExample;
  });
}

function validateExampleClasses(
  classes: ProgramClass[],
  examples: ProgramExample[],
): void {
  const classNames = new Set(classes.map((entry) => entry.name));
  for (let index = 0; index < examples.length; index += 1) {
    for (const extraction of examples[index].output) {
      if (!classNames.has(extraction.extractionClass)) {
        fail(
          `examples[${index}] output extractionClass must match a declared class: ${extraction.extractionClass}`,
        );
      }
    }
  }
}

export async function normalizeProgram(input: ProgramInput): Promise<Program> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail("program must be an object");
  }

  const instructions = ensureNonEmptyString("instructions", input.instructions);
  const description = ensureNonEmptyString(
    "description",
    input.description ?? instructions,
  );
  const examples = normalizeExamples(input.examples);
  const classes = normalizeClasses(input.classes, examples);
  validateExampleClasses(classes, examples);
  const constraints = normalizeConstraints(input.constraints);

  const normalizedSchema = normalizeSchemaDialect(input.schema);

  const canonicalPayload = stableStringify({
    instructions,
    description,
    classes,
    constraints,
    examples,
    schema: normalizedSchema,
  });
  const computedHash = await sha256Hex(canonicalPayload);
  const providedHash = input.programHash;
  if (providedHash !== undefined && !/^[0-9a-f]{64}$/.test(providedHash)) {
    fail("programHash must be a 64-char lowercase hex string when provided");
  }
  const programHash = providedHash ?? computedHash;

  const programId = input.programId === undefined
    ? `program-${programHash.slice(0, 16)}`
    : ensureNonEmptyString("programId", input.programId);

  return {
    programId,
    description,
    classes,
    constraints,
    instructions,
    examples,
    schema: normalizedSchema,
    programHash,
  };
}
