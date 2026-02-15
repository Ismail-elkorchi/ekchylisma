import type { Extraction } from "./types.ts";

export type QuoteInvariantErrorCode =
  | "INVALID_OFFSETS"
  | "OFFSETS_OUT_OF_RANGE"
  | "UNSUPPORTED_OFFSET_MODE"
  | "OFFSET_MISMATCH"
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
  extraction: Pick<Extraction, "quote" | "offsetMode" | "charStart" | "charEnd" | "span">,
): void {
  const { quote, offsetMode, charStart, charEnd, span } = extraction;

  if (offsetMode !== "utf16_code_unit") {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "UNSUPPORTED_OFFSET_MODE",
      message: "Only utf16_code_unit offsets are supported.",
      quote,
      actualQuote: "",
      charStart,
      charEnd,
      docLength: docText.length,
    });
  }

  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd) || charStart > charEnd) {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "INVALID_OFFSETS",
      message: "Offsets must contain integer bounds where charStart <= charEnd.",
      quote,
      actualQuote: "",
      charStart,
      charEnd,
      docLength: docText.length,
    });
  }

  if (
    span.offsetMode !== offsetMode
    || span.charStart !== charStart
    || span.charEnd !== charEnd
  ) {
    throw new QuoteInvariantViolation({
      name: "QuoteInvariantError",
      code: "OFFSET_MISMATCH",
      message: "Top-level offsets must match span offsets.",
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
      code: "OFFSETS_OUT_OF_RANGE",
      message: "Offsets must be within document bounds.",
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
