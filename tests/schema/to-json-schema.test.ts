import { s } from "../../src/schema/s.ts";
import { toJsonSchema } from "../../src/schema/toJsonSchema.ts";
import { assertEqual, test } from "../harness.ts";

test("toJsonSchema emits deterministic object schema with optional fields", () => {
  const schema = s.object({
    id: s.string(),
    status: s.enum(["open", "closed"]),
    score: s.optional(s.number()),
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
  const schema = s.union([s.literal("one"), s.number()]);
  const jsonSchema = toJsonSchema(schema);

  assertEqual(
    JSON.stringify(jsonSchema),
    JSON.stringify({
      anyOf: [{ const: "one" }, { type: "number" }],
    }),
  );
});
