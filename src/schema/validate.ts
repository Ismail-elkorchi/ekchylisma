import type {
  EnumSchema,
  LiteralSchema,
  ObjectShape,
  OptionalSchema,
  SchemaAny,
  UnionSchema,
} from "./schemaCue.ts";

export type ValidationErrorCode =
  | "type_mismatch"
  | "literal_mismatch"
  | "enum_mismatch"
  | "required"
  | "unexpected_property"
  | "union_no_match"
  | "max_depth";

export type ValidationError = {
  path: string;
  code: ValidationErrorCode;
  message: string;
  expected?: string;
  actual?: string;
};

export type ValidateOptions = {
  maxErrors?: number;
  maxDepth?: number;
  strictObject?: boolean;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
  truncated: boolean;
};

function jsonPointerToken(value: string | number): string {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function appendPath(path: string, value: string | number): string {
  return `${path}/${jsonPointerToken(value)}`;
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ValidationState = {
  maxErrors: number;
  maxDepth: number;
  strictObject: boolean;
  truncated: boolean;
};

function pushError(
  errors: ValidationError[],
  state: ValidationState,
  error: ValidationError,
): void {
  if (errors.length >= state.maxErrors) {
    state.truncated = true;
    return;
  }

  errors.push(error);
}

function validateLiteral(
  schema: LiteralSchema<string | number | boolean | null>,
  value: unknown,
  path: string,
  errors: ValidationError[],
  state: ValidationState,
): void {
  if (!Object.is(value, schema.value)) {
    pushError(errors, state, {
      path,
      code: "literal_mismatch",
      message: `Expected literal ${JSON.stringify(schema.value)}.`,
      expected: JSON.stringify(schema.value),
      actual: JSON.stringify(value),
    });
  }
}

function validateEnum(
  schema: EnumSchema<
    readonly [
      string | number | boolean | null,
      ...(string | number | boolean | null)[],
    ]
  >,
  value: unknown,
  path: string,
  errors: ValidationError[],
  state: ValidationState,
): void {
  if (schema.values.includes(value as never)) {
    return;
  }

  pushError(errors, state, {
    path,
    code: "enum_mismatch",
    message: `Value must be one of ${JSON.stringify(schema.values)}.`,
    expected: JSON.stringify(schema.values),
    actual: JSON.stringify(value),
  });
}

function validateObject(
  shape: ObjectShape,
  value: unknown,
  path: string,
  errors: ValidationError[],
  depth: number,
  state: ValidationState,
): void {
  if (!isPlainRecord(value)) {
    pushError(errors, state, {
      path,
      code: "type_mismatch",
      message: "Expected object.",
      expected: "object",
      actual: describeValue(value),
    });
    return;
  }

  const knownKeys = Object.keys(shape).sort();
  const valueRecord = value as Record<string, unknown>;

  for (const key of knownKeys) {
    if (errors.length >= state.maxErrors) {
      state.truncated = true;
      return;
    }

    const keyPath = appendPath(path, key);
    const childSchema = shape[key];
    const hasValue = Object.prototype.hasOwnProperty.call(valueRecord, key);

    if (!hasValue) {
      if (childSchema.kind !== "optional") {
        pushError(errors, state, {
          path: keyPath,
          code: "required",
          message: `Missing required property ${key}.`,
          expected: "present",
          actual: "missing",
        });
      }
      continue;
    }

    validateNode(
      childSchema,
      valueRecord[key],
      keyPath,
      errors,
      depth + 1,
      state,
    );
  }

  if (!state.strictObject) {
    return;
  }

  const unexpectedKeys = Object.keys(valueRecord)
    .filter((key) => !Object.prototype.hasOwnProperty.call(shape, key))
    .sort();

  for (const key of unexpectedKeys) {
    pushError(errors, state, {
      path: appendPath(path, key),
      code: "unexpected_property",
      message: `Unexpected property ${key}.`,
      expected: "declared property",
      actual: "undeclared property",
    });
  }
}

function validateUnion(
  schema: UnionSchema<readonly [SchemaAny, SchemaAny, ...SchemaAny[]]>,
  value: unknown,
  path: string,
  errors: ValidationError[],
  depth: number,
  state: ValidationState,
): void {
  for (const option of schema.options) {
    const branchState: ValidationState = {
      ...state,
      truncated: false,
    };
    const branchErrors: ValidationError[] = [];

    validateNode(option, value, path, branchErrors, depth + 1, branchState);
    if (branchErrors.length === 0 && !branchState.truncated) {
      return;
    }
  }

  pushError(errors, state, {
    path,
    code: "union_no_match",
    message: "Value does not satisfy any union branch.",
  });
}

function validateNode(
  schema: SchemaAny,
  value: unknown,
  path: string,
  errors: ValidationError[],
  depth: number,
  state: ValidationState,
): void {
  if (depth > state.maxDepth) {
    pushError(errors, state, {
      path,
      code: "max_depth",
      message: `Validation depth exceeded ${state.maxDepth}.`,
    });
    return;
  }

  switch (schema.kind) {
    case "optional": {
      if (value === undefined) {
        return;
      }

      validateNode(
        (schema as OptionalSchema<SchemaAny>).inner,
        value,
        path,
        errors,
        depth + 1,
        state,
      );
      return;
    }

    case "string": {
      if (typeof value !== "string") {
        pushError(errors, state, {
          path,
          code: "type_mismatch",
          message: "Expected string.",
          expected: "string",
          actual: describeValue(value),
        });
      }
      return;
    }

    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        pushError(errors, state, {
          path,
          code: "type_mismatch",
          message: "Expected finite number.",
          expected: "number",
          actual: describeValue(value),
        });
      }
      return;
    }

    case "boolean": {
      if (typeof value !== "boolean") {
        pushError(errors, state, {
          path,
          code: "type_mismatch",
          message: "Expected boolean.",
          expected: "boolean",
          actual: describeValue(value),
        });
      }
      return;
    }

    case "literal":
      validateLiteral(schema, value, path, errors, state);
      return;

    case "enum":
      validateEnum(schema, value, path, errors, state);
      return;

    case "array": {
      if (!Array.isArray(value)) {
        pushError(errors, state, {
          path,
          code: "type_mismatch",
          message: "Expected array.",
          expected: "array",
          actual: describeValue(value),
        });
        return;
      }

      for (let index = 0; index < value.length; index += 1) {
        validateNode(
          schema.item,
          value[index],
          appendPath(path, index),
          errors,
          depth + 1,
          state,
        );
      }
      return;
    }

    case "object":
      validateObject(schema.shape, value, path, errors, depth, state);
      return;

    case "union":
      validateUnion(schema, value, path, errors, depth, state);
      return;

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

export function validate(
  schema: SchemaAny,
  value: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const state: ValidationState = {
    maxErrors: options.maxErrors ?? 50,
    maxDepth: options.maxDepth ?? 64,
    strictObject: options.strictObject ?? true,
    truncated: false,
  };

  validateNode(schema, value, "", errors, 0, state);

  return {
    ok: errors.length === 0,
    errors,
    truncated: state.truncated,
  };
}
