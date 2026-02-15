export type FrameDecodeError = {
  line: number;
  message: string;
  frameSnippet: string;
};

export type FrameDecodeResult =
  | {
    ok: true;
    usedFrames: boolean;
    text: string;
  }
  | {
    ok: false;
    error: FrameDecodeError;
  };

function collectText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (typeof entry === "object" && entry !== null && typeof (entry as { text?: unknown }).text === "string") {
        return (entry as { text: string }).text;
      }
      return "";
    })
    .join("");
}

function extractFrameContent(frame: unknown): string {
  if (typeof frame === "string") {
    return frame;
  }

  if (typeof frame !== "object" || frame === null) {
    return "";
  }

  const record = frame as Record<string, unknown>;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as Record<string, unknown>;
    const delta = typeof choice.delta === "object" && choice.delta !== null
      ? choice.delta as Record<string, unknown>
      : null;
    const message = typeof choice.message === "object" && choice.message !== null
      ? choice.message as Record<string, unknown>
      : null;
    const deltaContent = collectText(delta?.content);
    if (deltaContent.length > 0) {
      return deltaContent;
    }
    return collectText(message?.content);
  }

  const candidates = record.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const content = (candidates[0] as { content?: { parts?: unknown } }).content;
    if (content && Array.isArray(content.parts)) {
      return collectText(content.parts);
    }
  }

  if (typeof record.output_text === "string") {
    return record.output_text;
  }

  if (typeof record.response === "string") {
    return record.response;
  }

  if (typeof record.content === "string") {
    return record.content;
  }

  return "";
}

function parseFramePayload(payload: string, line: number): { ok: true; content: string } | {
  ok: false;
  error: FrameDecodeError;
} {
  try {
    const parsed = JSON.parse(payload);
    return {
      ok: true,
      content: extractFrameContent(parsed),
    };
  } catch {
    return {
      ok: false,
      error: {
        line,
        message: `Malformed streamed frame at line ${line}.`,
        frameSnippet: payload.slice(0, 120),
      },
    };
  }
}

export function decodeStreamingJsonFrames(sourceText: string): FrameDecodeResult {
  const lines = sourceText.split(/\r?\n/);
  const fragments: string[] = [];
  let sawFramePrefix = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = lines[index].trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.startsWith("event:") || trimmed.startsWith("id:") || trimmed.startsWith(":")) {
      sawFramePrefix = true;
      continue;
    }

    if (!trimmed.startsWith("data:")) {
      continue;
    }

    sawFramePrefix = true;
    const payload = trimmed.slice(5).trim();
    if (payload.length === 0 || payload === "[DONE]" || payload === "DONE") {
      continue;
    }

    const parsed = parseFramePayload(payload, lineNumber);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
      };
    }
    if (parsed.content.length > 0) {
      fragments.push(parsed.content);
    }
  }

  if (!sawFramePrefix || fragments.length === 0) {
    return {
      ok: true,
      usedFrames: false,
      text: sourceText,
    };
  }

  return {
    ok: true,
    usedFrames: true,
    text: fragments.join(""),
  };
}
