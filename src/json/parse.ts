export type JsonParseFailureCode =
  | "stream_frame_malformed"
  | "json_payload_missing"
  | "json_parse_failed"
  | "schema_validation_failed";

export type JsonParseError = {
  name: "JsonParseError";
  failureCode: JsonParseFailureCode;
  message: string;
  position: number | null;
  line: number | null;
  column: number | null;
  snippet: string;
  inputLength: number;
};

export class JsonParseFailure extends Error {
  detail: JsonParseError;

  constructor(detail: JsonParseError) {
    super(detail.message);
    this.name = detail.name;
    this.detail = detail;
  }
}

function parsePosition(message: string): number | null {
  const match = message.match(/position\s+(\d+)/i) ??
    message.match(/at\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseLineColumn(
  message: string,
): { line: number | null; column: number | null } {
  const match = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (!match) {
    return { line: null, column: null };
  }

  return {
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
  };
}

function snippetAt(text: string, position: number | null): string {
  if (position === null || Number.isNaN(position)) {
    return text.slice(0, 80);
  }

  const start = Math.max(0, position - 20);
  const end = Math.min(text.length, position + 20);
  return text.slice(start, end);
}

function buildParseError(
  text: string,
  error: unknown,
  failureCode: JsonParseFailureCode = "json_parse_failed",
): JsonParseError {
  const message = error instanceof Error ? error.message : String(error);
  const position = parsePosition(message);
  const { line, column } = parseLineColumn(message);

  return {
    name: "JsonParseError",
    failureCode,
    message,
    position,
    line,
    column,
    snippet: snippetAt(text, position),
    inputLength: text.length,
  };
}

export function parseJsonStrict(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new JsonParseFailure(buildParseError(text, error));
  }
}

export function tryParseJsonStrict(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: JsonParseError } {
  try {
    return {
      ok: true,
      value: parseJsonStrict(text),
    };
  } catch (error) {
    if (error instanceof JsonParseFailure) {
      return {
        ok: false,
        error: error.detail,
      };
    }

    throw error;
  }
}
