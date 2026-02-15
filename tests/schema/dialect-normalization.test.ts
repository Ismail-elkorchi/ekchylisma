import { normalizeSchemaDialect } from "../../src/schema/normalizeDialect.ts";
import { assertEqual, assertRejects, test } from "../harness.ts";

test("normalizeSchemaDialect canonicalizes supported dialect metadata and nullable fields", () => {
  const normalized = normalizeSchemaDialect({
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Ticket",
    description: "metadata should be dropped",
    type: "object",
    required: ["value"],
    properties: {
      value: {
        type: "string",
        nullable: true,
      },
    },
  });

  assertEqual(
    JSON.stringify(normalized),
    JSON.stringify({
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { const: null },
          ],
        },
      },
      required: ["value"],
    }),
  );
});

test("normalizeSchemaDialect rejects unsupported dialect keywords", async () => {
  await assertRejects(
    () =>
      Promise.resolve(
        normalizeSchemaDialect({
          type: "object",
          definitions: {
            value: { type: "string" },
          },
        }),
      ),
    (error) => error instanceof Error && error.message.includes("definitions"),
  );
});
