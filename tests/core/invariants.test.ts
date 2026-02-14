import {
  assertQuoteInvariant,
  QuoteInvariantViolation,
} from "../../src/core/invariants.ts";
import type { Extraction } from "../../src/core/types.ts";
import { assertEqual, assertRejects, test } from "../harness.ts";

function buildExtraction(quote: string, charStart: number, charEnd: number): Pick<Extraction, "quote" | "span"> {
  return {
    quote,
    span: {
      offsetMode: "utf16_code_unit",
      charStart,
      charEnd,
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
    (error) => error instanceof QuoteInvariantViolation && error.detail.code === "INVALID_SPAN",
  );

  await assertRejects(
    () => assertQuoteInvariant(doc, buildExtraction("a", -1, 1)),
    (error) => error instanceof QuoteInvariantViolation && error.detail.code === "SPAN_OUT_OF_RANGE",
  );
});
