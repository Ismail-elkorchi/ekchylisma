import { repairJsonText } from "../../src/json/repair.ts";
import { parseJsonStrict } from "../../src/json/parse.ts";
import {
  invalidControlCharFixture,
  wrappedJsonFixture,
} from "./fixtures.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("repairJsonText removes invalid ASCII control chars and logs applied steps", () => {
  const repaired = repairJsonText(invalidControlCharFixture);

  assertEqual(repaired.text, "{\"value\":\"ab\"}");
  assertEqual(repaired.log.changed, true);
  assertEqual(repaired.log.steps[1].step, "removeAsciiControlChars");
  assertEqual(repaired.log.steps[1].applied, true);
});

test("repairJsonText trims wrapper junk and safe trailing commas", () => {
  const repaired = repairJsonText(wrappedJsonFixture);

  assertEqual(repaired.text, "{\"ok\": true}");
  const parsed = parseJsonStrict(repaired.text);
  assert((parsed as { ok: boolean }).ok === true, "parsed payload should be valid json");
});
