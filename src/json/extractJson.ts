export type JsonFlavor = "json" | "jsonl" | "unknown";

export type JsonSlice = {
  start: number;
  end: number;
  text: string;
  kind: "object" | "array";
};

function scanCompleteJson(text: string, start: number): JsonSlice | null {
  const opening = text[start];
  if (opening !== "{" && opening !== "[") {
    return null;
  }

  const closing = opening === "{" ? "}" : "]";
  const stack: string[] = [closing];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (expected !== char) {
        return null;
      }

      if (stack.length === 0) {
        const end = index + 1;
        return {
          start,
          end,
          text: text.slice(start, end),
          kind: opening === "{" ? "object" : "array",
        };
      }
    }
  }

  return null;
}

export function extractFirstJson(text: string): JsonSlice | null {
  const slices = extractJsonCandidates(text, { maxCandidates: 1 });
  return slices[0] ?? null;
}

export function extractJsonCandidates(
  text: string,
  options: { maxCandidates?: number } = {},
): JsonSlice[] {
  const maxCandidates = options.maxCandidates ?? Number.POSITIVE_INFINITY;
  if (Number.isNaN(maxCandidates) || maxCandidates <= 0) {
    return [];
  }

  const slices: JsonSlice[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const slice = scanCompleteJson(text, index);
    if (slice) {
      slices.push(slice);
      index = slice.end - 1;
      if (slices.length >= maxCandidates) {
        break;
      }
    }
  }

  return slices;
}

export function detectJsonFlavor(text: string): JsonFlavor {
  const trimmed = text.trim();
  if (!trimmed) {
    return "unknown";
  }

  try {
    JSON.parse(trimmed);
    return "json";
  } catch {
    // continue to JSONL probe
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(
    Boolean,
  );
  if (lines.length < 2) {
    return "unknown";
  }

  for (const line of lines) {
    try {
      JSON.parse(line);
    } catch {
      return "unknown";
    }
  }

  return "jsonl";
}
