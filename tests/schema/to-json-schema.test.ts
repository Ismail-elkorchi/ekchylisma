import { schemaCue } from "../../src/schema/schemaCue.ts";
import { toJsonSchema } from "../../src/schema/toJsonSchema.ts";
import { assertEqual, test } from "../harness.ts";

test("toJsonSchema emits deterministic object schema with optional fields", () => {
  const schema = schemaCue.object({
    id: schemaCue.string(),
    status: schemaCue.enum(["open", "closed"]),
    score: schemaCue.optional(schemaCue.number()),
  });

  const jsonSchema = toJsonSchema(schema);

  assertEqual(
    JSON.stringify(jsonSchema),
    JSON.stringify({
      type: "object",
      properties: {
        id: { type: "string" },
        score: { type: "number" },
        status: { enum: ["open", "closed"] },
      },
      required: ["id", "status"],
      additionalProperties: false,
    }),
  );
});

test("toJsonSchema emits anyOf for unions", () => {
  const schema = schemaCue.union([
    schemaCue.literal("one"),
    schemaCue.number(),
  ]);
  const jsonSchema = toJsonSchema(schema);

  assertEqual(
    JSON.stringify(jsonSchema),
    JSON.stringify({
      anyOf: [{ const: "one" }, { type: "number" }],
    }),
  );
});
