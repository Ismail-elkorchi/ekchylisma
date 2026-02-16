import { schemaCue } from "../../src/schema/schemaCue.ts";
import { validate } from "../../src/schema/validate.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("validate succeeds on matching object schema", () => {
  const schema = schemaCue.object({
    name: schemaCue.string(),
    age: schemaCue.optional(schemaCue.number()),
    tags: schemaCue.array(schemaCue.string()),
  });

  const result = validate(schema, {
    name: "Ada",
    tags: ["engineer", "writer"],
  });

  assert(result.ok, "result should be valid");
  assertEqual(result.errors.length, 0);
});

test("validate reports deterministic json-pointer errors", () => {
  const schema = schemaCue.object({
    name: schemaCue.string(),
    tags: schemaCue.array(schemaCue.string()),
  });

  const result = validate(schema, {
    extra: true,
    name: 42,
    tags: ["ok", 1],
  });

  assertEqual(result.ok, false);
  assertEqual(result.errors.length, 3);
  assertEqual(result.errors[0].path, "/name");
  assertEqual(result.errors[0].code, "type_mismatch");
  assertEqual(result.errors[1].path, "/tags/1");
  assertEqual(result.errors[1].code, "type_mismatch");
  assertEqual(result.errors[2].path, "/extra");
  assertEqual(result.errors[2].code, "unexpected_property");
});

test("validate escapes JSON pointer keys", () => {
  const schema = schemaCue.object({
    "a/b": schemaCue.string(),
    "x~y": schemaCue.number(),
  });

  const result = validate(schema, {});

  assertEqual(result.ok, false);
  assertEqual(result.errors[0].path, "/a~1b");
  assertEqual(result.errors[1].path, "/x~0y");
});

test("validate union mismatch produces union_no_match", () => {
  const schema = schemaCue.union([schemaCue.string(), schemaCue.number()]);
  const result = validate(schema, false);

  assertEqual(result.ok, false);
  assertEqual(result.errors.length, 1);
  assertEqual(result.errors[0].code, "union_no_match");
});

test("validate enforces maxDepth", () => {
  const schema = schemaCue.array(schemaCue.array(schemaCue.string()));
  const result = validate(schema, [["ok"]], { maxDepth: 1 });

  assertEqual(result.ok, false);
  assertEqual(result.errors[0].code, "max_depth");
});
