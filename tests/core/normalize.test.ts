import {
  normalizeNewlines,
  normalizeText,
  trimTrailingWhitespacePerLine,
} from "../../src/core/normalize.ts";
import { assert, assertEqual, test } from "../harness.ts";

test("normalizeNewlines converts CRLF and CR to LF", () => {
  const input = "a\r\nb\rc\nd";
  const result = normalizeNewlines(input);

  assertEqual(result.text, "a\nb\nc\nd");
  assertEqual(result.ledger.steps.length, 1);
  assertEqual(result.ledger.steps[0].step, "normalizeNewlines");
  assertEqual(result.ledger.steps[0].mappingStrategy, "not_reversible");
});

test("trimTrailingWhitespacePerLine removes trailing spaces and tabs only", () => {
  const input = "  keep-leading  \ninner  spaces stay\t \nlast-line\t";
  const result = trimTrailingWhitespacePerLine(input);

  assertEqual(result.text, "  keep-leading\ninner  spaces stay\nlast-line");
  assertEqual(result.ledger.steps[0].step, "trimTrailingWhitespacePerLine");
  assertEqual(result.ledger.steps[0].mappingStrategy, "not_reversible");
});

test("normalizeText composes deterministic steps", () => {
  const input = "x\r\n  y\t \n";
  const first = normalizeText(input, { trimTrailingWhitespacePerLine: true });
  const second = normalizeText(input, { trimTrailingWhitespacePerLine: true });

  assertEqual(first.text, "x\n  y\n");
  assertEqual(first.text, second.text);
  assertEqual(JSON.stringify(first.ledger), JSON.stringify(second.ledger));
  assertEqual(first.ledger.steps.length, 2);
});
