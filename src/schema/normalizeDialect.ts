import type { JsonSchemaSubset } from "../core/types.ts";

const SUPPORTED_DIALECTS = new Set([
  "http://json-schema.org/draft-04/schema#",
  "http://json-schema.org/draft-06/schema#",
  "http://json-schema.org/draft-07/schema#",
  "https://json-schema.org/draft/2019-09/schema",
  "https://json-schema.org/draft/2020-12/schema",
]);

const ALLOWED_KEYS = new Set([
  "$schema",
  "$id",
  "id",
  "title",
  "description",
  "default",
  "examples",
  "nullable",
  "type",
  "properties",
  "items",
  "enum",
  "const",
  "required",
  "additionalProperties",
  "anyOf",
]);

const UNSUPPORTED_DIALECT_KEYS = new Set([
  "$defs",
  "definitions",
  "$ref",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "patternProperties",
  "unevaluatedProperties",
  "dependentSchemas",
]);

function fail(path: string, message: string): never {
  throw new Error(`invalid schema dialect at ${path}: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

function normalizeNode(input: unknown, path: string): JsonSchemaSubset {
  if (!isPlainObject(input)) {
    fail(path, "schema nodes must be objects");
  }

  const dialect = input.$schema;
  if (dialect !== undefined) {
    if (typeof dialect !== "string") {
      fail(path, "$schema must be a string");
    }
    if (!SUPPORTED_DIALECTS.has(dialect)) {
      fail(path, `unsupported $schema URI: ${dialect}`);
    }
  }

  for (const key of Object.keys(input)) {
    if (UNSUPPORTED_DIALECT_KEYS.has(key)) {
      fail(path, `keyword ${key} is not supported by JsonSchemaSubset`);
    }
    if (!ALLOWED_KEYS.has(key)) {
      fail(path, `keyword ${key} is not supported by JsonSchemaSubset`);
    }
  }

  const nullable = input.nullable;
  if (nullable !== undefined && typeof nullable !== "boolean") {
    fail(path, "nullable must be a boolean when provided");
  }

  const normalized: JsonSchemaSubset = {};

  if (input.type !== undefined) {
    if (
      input.type !== "object"
      && input.type !== "array"
      && input.type !== "string"
      && input.type !== "number"
      && input.type !== "boolean"
    ) {
      fail(path, "type must be one of object|array|string|number|boolean");
    }
    normalized.type = input.type;
  }

  if (input.properties !== undefined) {
    if (!isPlainObject(input.properties)) {
      fail(path, "properties must be an object");
    }
    const entries = Object.entries(input.properties).sort(([a], [b]) => a.localeCompare(b));
    const properties: Record<string, JsonSchemaSubset> = {};
    for (const [key, child] of entries) {
      properties[key] = normalizeNode(child, `${path}.properties.${key}`);
    }
    normalized.properties = properties;
  }

  if (input.items !== undefined) {
    normalized.items = normalizeNode(input.items, `${path}.items`);
  }

  if (input.enum !== undefined) {
    if (!Array.isArray(input.enum)) {
      fail(path, "enum must be an array");
    }
    for (let index = 0; index < input.enum.length; index += 1) {
      if (!isJsonScalar(input.enum[index])) {
        fail(path, `enum[${index}] must be a string|number|boolean|null`);
      }
    }
    normalized.enum = [...input.enum];
  }

  if ("const" in input) {
    if (!isJsonScalar(input.const)) {
      fail(path, "const must be a string|number|boolean|null");
    }
    normalized.const = input.const;
  }

  if (input.required !== undefined) {
    if (!Array.isArray(input.required) || input.required.some((value) => typeof value !== "string")) {
      fail(path, "required must be an array of strings");
    }
    normalized.required = [...new Set(input.required)].sort();
  }

  if (input.additionalProperties !== undefined) {
    if (typeof input.additionalProperties !== "boolean") {
      fail(path, "additionalProperties must be a boolean");
    }
    normalized.additionalProperties = input.additionalProperties;
  }

  if (input.anyOf !== undefined) {
    if (!Array.isArray(input.anyOf) || input.anyOf.length === 0) {
      fail(path, "anyOf must be a non-empty array");
    }
    normalized.anyOf = input.anyOf.map((item, index) => normalizeNode(item, `${path}.anyOf[${index}]`));
  }

  if (nullable !== true) {
    return normalized;
  }

  if (normalized.const === null || normalized.enum?.includes(null)) {
    return normalized;
  }

  const nullableBranch: JsonSchemaSubset = { const: null };
  if (normalized.anyOf) {
    const hasNullBranch = normalized.anyOf.some((candidate) => candidate.const === null);
    if (!hasNullBranch) {
      normalized.anyOf = [...normalized.anyOf, nullableBranch];
    }
    return normalized;
  }

  return {
    anyOf: [normalized, nullableBranch],
  };
}

export function normalizeSchemaDialect(input: unknown): JsonSchemaSubset {
  return normalizeNode(input, "$");
}
