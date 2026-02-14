import type { Extraction } from "./types.ts";

export type QuoteInvariantErrorCode =
  | "INVALID_SPAN"
  | "SPAN_OUT_OF_RANGE"
  | "QUOTE_MISMATCH";

export type QuoteInvariantError = {
  name: "QuoteInvariantError";
  code: QuoteInvariantErrorCode;
  message: string;
  quote: string;
  actualQuote: string;
  charStart: number;
  charEnd: number;
  docLength: number;
};

export class QuoteInvariantViolation extends Error {
  detail: QuoteInvariantError;

  constructor(detail: QuoteInvariantError) {
    super(detail.message);
    this.name = detail.name;
    this.detail = detail;
  }
}

export function assertQuoteInvariant(
  docText: string,
  extraction: Pick<Extraction, "quote" | "span">,
): void {
  const { quote, span } = extraction;
  const { charStart, charEnd } = span;

  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd) || charStart > charEnd) {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "INVALID_SPAN",
      message: "Span must contain integer bounds where charStart <= charEnd.",
      quote,
      actualQuote: "",
      charStart,
      charEnd,
      docLength: docText.length,
    });
  }

  if (charStart < 0 || charEnd > docText.length) {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "SPAN_OUT_OF_RANGE",
      message: "Span must be within document bounds.",
      quote,
      actualQuote: "",
      charStart,
      charEnd,
      docLength: docText.length,
    });
  }

  const actualQuote = docText.slice(charStart, charEnd);
  if (actualQuote !== quote) {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "QUOTE_MISMATCH",
      message: "Extraction quote does not match the document slice at span.",
      quote,
      actualQuote,
      charStart,
      charEnd,
      docLength: docText.length,
    });
  }
}
