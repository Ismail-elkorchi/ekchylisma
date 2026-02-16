import { normalizeProgram } from "../../src/core/program.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

test("normalizeProgram derives structured fields deterministically from legacy input", async () => {
  const first = await normalizeProgram({
    instructions: "Extract token Beta.",
    schema: { type: "object" },
    examples: [],
  });
  const second = await normalizeProgram({
    instructions: "Extract token Beta.",
    schema: { type: "object" },
    examples: [],
  });

  assertEqual(first.description, "Extract token Beta.");
  assertEqual(first.classes.length, 1);
  assertEqual(first.classes[0].name, "extraction");
  assertEqual(first.constraints.requireExactQuote, true);
  assertEqual(first.constraints.forbidOverlap, true);
  assert(
    first.programId.startsWith("program-"),
    "programId should be generated",
  );
  assertEqual(
    first.programHash,
    second.programHash,
    "program hash should be deterministic",
  );
  assertEqual(
    first.programId,
    second.programId,
    "program id should be deterministic",
  );
});

test("normalizeProgram rejects invalid constraints and duplicate class names", async () => {
  await assertRejects(
    () =>
      normalizeProgram({
        instructions: "Extract token Beta.",
        schema: { type: "object" },
        examples: [],
        classes: [{ name: "token" }, { name: "token" }],
      }),
    (error) =>
      error instanceof Error && error.message.includes("duplicate name"),
    "duplicate classes should fail",
  );

  await assertRejects(
    () =>
      normalizeProgram({
        instructions: "Extract token Beta.",
        schema: { type: "object" },
        examples: [],
        constraints: { maxExtractionsPerShard: 0 },
      }),
    (error) =>
      error instanceof Error && error.message.includes("positive integer"),
    "invalid maxExtractionsPerShard should fail",
  );
});
