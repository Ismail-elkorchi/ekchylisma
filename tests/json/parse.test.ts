import {
  JsonParseFailure,
  parseJsonStrict,
  tryParseJsonStrict,
} from "../../src/json/parse.ts";
import { repairJsonText } from "../../src/json/repair.ts";
import {
  invalidControlCharFixture,
  unterminatedStringFixture,
} from "./fixtures.ts";
import { assert, assertEqual, assertRejects, test } from "../harness.ts";

test("parseJsonStrict parses valid JSON", () => {
  const value = parseJsonStrict("{\"ok\":true}");
  assertEqual((value as { ok: boolean }).ok, true);
});

test("unterminated string fixture yields structured parse failure", async () => {
  await assertRejects(
    () => parseJsonStrict(unterminatedStringFixture),
    (error) => {
      if (!(error instanceof JsonParseFailure)) {
        return false;
      }

      assertEqual(error.detail.name, "JsonParseError");
      assert(typeof error.detail.message === "string", "error message should be present");
      assertEqual(error.detail.inputLength, unterminatedStringFixture.length);
      return true;
    },
  );
});

test("repair + parse handles invalid control char fixture", () => {
  const repaired = repairJsonText(invalidControlCharFixture);
  const result = tryParseJsonStrict(repaired.text);

  assertEqual(result.ok, true);
  if (result.ok) {
    assertEqual((result.value as { value: string }).value, "ab");
  }
});
