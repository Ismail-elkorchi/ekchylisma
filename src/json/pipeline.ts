import { extractFirstJson } from "./extractJson.ts";
import type { JsonParseError } from "./parse.ts";
import { tryParseJsonStrict } from "./parse.ts";
import type { RepairLog, RepairOptions } from "./repair.ts";
import { repairJsonText } from "./repair.ts";
import { decodeStreamingJsonFrames } from "./frameDecoder.ts";

export type JsonPipelineParseLog =
  | {
    ok: true;
  }
  | {
    ok: false;
    error: JsonParseError;
  };

export type JsonPipelineLog = {
  extractedJson: {
    found: boolean;
    start: number | null;
    end: number | null;
    kind: "object" | "array" | null;
    sourceLength: number;
    candidateLength: number;
  };
  repair: RepairLog;
  parse: JsonPipelineParseLog;
};

export type JsonPipelineSuccess = {
  ok: true;
  value: unknown;
  log: JsonPipelineLog;
};

export type JsonPipelineFailureResult = {
  ok: false;
  error: JsonParseError;
  log: JsonPipelineLog;
};

export class JsonPipelineFailure extends Error {
  readonly error: JsonParseError;

  readonly log: JsonPipelineLog;

  constructor(error: JsonParseError, log: JsonPipelineLog) {
    super(error.message);
    this.name = "JsonPipelineFailure";
    this.error = error;
    this.log = log;
  }
}

export type JsonPipelineOptions = {
  repair?: RepairOptions;
};

export function parseJsonWithRepairPipeline(
  sourceText: string,
  options: JsonPipelineOptions = {},
): JsonPipelineSuccess | JsonPipelineFailureResult {
  const decodedFrames = decodeStreamingJsonFrames(sourceText);
  if (!decodedFrames.ok) {
    const emptyRepairLog = repairJsonText("", options.repair).log;
    const frameError: JsonParseError = {
      name: "JsonParseError",
      message: decodedFrames.error.message,
      position: null,
      line: decodedFrames.error.line,
      column: null,
      snippet: decodedFrames.error.frameSnippet,
      inputLength: sourceText.length,
    };
    return {
      ok: false,
      error: frameError,
      log: {
        extractedJson: {
          found: false,
          start: null,
          end: null,
          kind: null,
          sourceLength: sourceText.length,
          candidateLength: 0,
        },
        repair: emptyRepairLog,
        parse: {
          ok: false,
          error: frameError,
        },
      },
    };
  }

  const normalizedSource = decodedFrames.text;
  const extractedJson = extractFirstJson(normalizedSource);
  const candidate = extractedJson ? extractedJson.text : normalizedSource;
  const repaired = repairJsonText(candidate, options.repair);
  const parsed = tryParseJsonStrict(repaired.text);

  const baseLog: Omit<JsonPipelineLog, "parse"> = {
    extractedJson: {
      found: extractedJson !== null,
      start: extractedJson?.start ?? null,
      end: extractedJson?.end ?? null,
      kind: extractedJson?.kind ?? null,
      sourceLength: sourceText.length,
      candidateLength: candidate.length,
    },
    repair: repaired.log,
  };

  if (parsed.ok) {
    return {
      ok: true,
      value: parsed.value,
      log: {
        ...baseLog,
        parse: {
          ok: true,
        },
      },
    };
  }

  return {
    ok: false,
    error: parsed.error,
    log: {
      ...baseLog,
      parse: {
        ok: false,
        error: parsed.error,
      },
    },
  };
}
