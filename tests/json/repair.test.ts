import { repairJsonText } from "../../src/json/repair.ts";
import { parseJsonWithRepairPipeline } from "../../src/json/pipeline.ts";
import { parseJsonStrict } from "../../src/json/parse.ts";
import { invalidControlCharFixture, wrappedJsonFixture } from "./fixtures.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("repairJsonText removes invalid ASCII control chars and logs applied steps", () => {
  const repaired = repairJsonText(invalidControlCharFixture);

  assertEqual(repaired.text, '{"value":"ab"}');
  assertEqual(repaired.log.changed, true);
  assertEqual(repaired.log.steps[1].step, "removeAsciiControlChars");
  assertEqual(repaired.log.steps[1].applied, true);
  assertEqual(repaired.log.budget.maxCandidateChars, null);
  assertEqual(repaired.log.budget.maxRepairChars, null);
  assertEqual(repaired.log.budget.candidateCharsTruncated, false);
  assertEqual(repaired.log.budget.repairCharsTruncated, false);
});

test("repairJsonText trims wrapper junk and safe trailing commas", () => {
  const repaired = repairJsonText(wrappedJsonFixture);

  assertEqual(repaired.text, '{"ok": true}');
  const parsed = parseJsonStrict(repaired.text);
  assert(
    (parsed as { ok: boolean }).ok === true,
    "parsed payload should be valid json",
  );
});

test("parseJsonWithRepairPipeline enforces repair caps with deterministic diagnostics", () => {
  const payload = '{"value":"abcdefghijklmnopqrstuvwxyz"}';
  const first = parseJsonWithRepairPipeline(payload, {
    repair: {
      maxRepairChars: 12,
    },
  });
  const second = parseJsonWithRepairPipeline(payload, {
    repair: {
      maxRepairChars: 12,
    },
  });

  assertEqual(first.ok, false);
  assertEqual(second.ok, false);
  assertEqual(first.log.repair.budget.maxRepairChars, 12);
  assertEqual(first.log.repair.budget.repairCharsTruncated, true);
  assertEqual(first.log.repair.budget.candidateCharsTruncated, false);
  assertEqual(
    JSON.stringify(first.log),
    JSON.stringify(second.log),
    "pipeline diagnostics should be deterministic for fixed repair caps",
  );
});
