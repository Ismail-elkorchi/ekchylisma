import { s } from "../../src/schema/s.ts";
import { validate } from "../../src/schema/validate.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("validate succeeds on matching object schema", () => {
  const schema = s.object({
    name: s.string(),
    age: s.optional(s.number()),
    tags: s.array(s.string()),
  });

  const result = validate(schema, {
    name: "Ada",
    tags: ["engineer", "writer"],
  });

  assert(result.ok, "result should be valid");
  assertEqual(result.errors.length, 0);
});

test("validate reports deterministic json-pointer errors", () => {
  const schema = s.object({
    name: s.string(),
    tags: s.array(s.string()),
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
  const schema = s.object({
    "a/b": s.string(),
    "x~y": s.number(),
  });

  const result = validate(schema, {});

  assertEqual(result.ok, false);
  assertEqual(result.errors[0].path, "/a~1b");
  assertEqual(result.errors[1].path, "/x~0y");
});

test("validate union mismatch produces union_no_match", () => {
  const schema = s.union([s.string(), s.number()]);
  const result = validate(schema, false);

  assertEqual(result.ok, false);
  assertEqual(result.errors.length, 1);
  assertEqual(result.errors[0].code, "union_no_match");
});

test("validate enforces maxDepth", () => {
  const schema = s.array(s.array(s.string()));
  const result = validate(schema, [["ok"]], { maxDepth: 1 });

  assertEqual(result.ok, false);
  assertEqual(result.errors[0].code, "max_depth");
});
