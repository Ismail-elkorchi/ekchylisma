import {
  assertQuoteInvariant,
  QuoteInvariantViolation,
} from "../../src/core/invariants.ts";
import type { Extraction } from "../../src/core/types.ts";
import { assertEqual, assertRejects, test } from "../harness.ts";

function buildExtraction(
  quote: string,
  charStart: number,
  charEnd: number,
  overrides: Partial<Pick<Extraction, "offsetMode" | "span">> = {},
): Pick<Extraction, "quote" | "offsetMode" | "charStart" | "charEnd" | "span"> {
  return {
    quote,
    offsetMode: overrides.offsetMode ?? "utf16_code_unit",
    charStart,
    charEnd,
    span: {
      offsetMode: overrides.span?.offsetMode ?? "utf16_code_unit",
      charStart: overrides.span?.charStart ?? charStart,
      charEnd: overrides.span?.charEnd ?? charEnd,
    },
  };
}

test("assertQuoteInvariant passes for matching quote and span", () => {
  const doc = "Alpha 🙂 Beta";
  assertQuoteInvariant(doc, buildExtraction("🙂", 6, 8));
});

test("assertQuoteInvariant throws mismatch with structured error", async () => {
  const doc = "hello world";
  await assertRejects(
    () => assertQuoteInvariant(doc, buildExtraction("planet", 6, 11)),
    (error) => {
      if (!(error instanceof QuoteInvariantViolation)) {
        return false;
      }

      assertEqual(error.detail.code, "QUOTE_MISMATCH");
      assertEqual(error.detail.actualQuote, "world");
      return true;
    },
  );
});

test("assertQuoteInvariant rejects invalid spans", async () => {
  const doc = "abcd";

  await assertRejects(
    () => assertQuoteInvariant(doc, buildExtraction("", 3, 1)),
    (error) =>
      error instanceof QuoteInvariantViolation &&
      error.detail.code === "INVALID_OFFSETS",
  );

  await assertRejects(
    () => assertQuoteInvariant(doc, buildExtraction("a", -1, 1)),
    (error) =>
      error instanceof QuoteInvariantViolation &&
      error.detail.code === "OFFSETS_OUT_OF_RANGE",
  );
});

test("assertQuoteInvariant rejects top-level and span offset mismatches", async () => {
  const doc = "Alpha Beta";

  await assertRejects(
    () =>
      assertQuoteInvariant(
        doc,
        buildExtraction("Beta", 6, 10, {
          span: { offsetMode: "utf16_code_unit", charStart: 5, charEnd: 9 },
        }),
      ),
    (error) =>
      error instanceof QuoteInvariantViolation &&
      error.detail.code === "OFFSET_MISMATCH",
  );
});

test("assertQuoteInvariant rejects unsupported offset modes", async () => {
  const doc = "Alpha Beta";

  await assertRejects(
    () =>
      assertQuoteInvariant(
        doc,
        buildExtraction("Beta", 6, 10, {
          offsetMode: "utf8_byte" as Extraction["offsetMode"],
        }),
      ),
    (error) =>
      error instanceof QuoteInvariantViolation &&
      error.detail.code === "UNSUPPORTED_OFFSET_MODE",
  );
});
