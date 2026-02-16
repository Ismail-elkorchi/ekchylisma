import type { JsonSchemaSubset } from "../core/types.ts";
import type { ObjectShape, SchemaAny } from "./s.ts";

function toObjectSchema(shape: ObjectShape): JsonSchemaSubset {
  const properties: Record<string, JsonSchemaSubset> = {};
  const required: string[] = [];

  for (const key of Object.keys(shape).sort()) {
    const node = shape[key];
    if (node.kind === "optional") {
      properties[key] = toJsonSchema(node.inner);
      continue;
    }

    required.push(key);
    properties[key] = toJsonSchema(node);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function toJsonSchema(schema: SchemaAny): JsonSchemaSubset {
  switch (schema.kind) {
    case "optional":
      return toJsonSchema(schema.inner);

    case "string":
      return { type: "string" };

    case "number":
      return { type: "number" };

    case "boolean":
      return { type: "boolean" };

    case "literal":
      return { const: schema.value };

    case "enum":
      return { enum: [...schema.values] };

    case "array":
      return {
        type: "array",
        items: toJsonSchema(schema.item),
      };

    case "object":
      return toObjectSchema(schema.shape);

    case "union":
      return {
        anyOf: schema.options.map((option) => toJsonSchema(option)),
      };

    default: {
      const unreachable: never = schema;
      throw new Error(
        `Unsupported schema node: ${
          (unreachable as { kind?: string }).kind ?? "unknown"
        }.`,
      );
    }
  }
}
