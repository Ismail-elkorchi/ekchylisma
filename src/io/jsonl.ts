import type { EvidenceBundle } from "../core/types.ts";

type JsonlInput = string | ReadableStream<string | Uint8Array>;

export function encodeEvidenceBundlesToJsonl(
  bundles: EvidenceBundle[],
): string {
  return `${bundles.map((bundle) => JSON.stringify(bundle)).join("\n")}\n`;
}

function parseJsonlLines(lines: string[]): EvidenceBundle[] {
  const bundles: EvidenceBundle[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    bundles.push(JSON.parse(line) as EvidenceBundle);
  }

  return bundles;
}

async function readStreamToLines(
  stream: ReadableStream<string | Uint8Array>,
): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  const lines: string[] = [];
  let carry = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk =
      typeof value === "string"
        ? value
        : decoder.decode(value, { stream: true });
    const combined = carry + chunk;
    const segments = combined.split(/\r?\n/);
    carry = segments.pop() ?? "";

    lines.push(...segments);
  }

  const trailing = carry.trim();
  if (trailing) {
    lines.push(carry);
  }

  return lines;
}

export async function* decodeJsonlToEvidenceBundles(
  input: JsonlInput,
): AsyncIterable<EvidenceBundle> {
  const lines =
    typeof input === "string"
      ? input.split(/\r?\n/)
      : await readStreamToLines(input);

  for (const bundle of parseJsonlLines(lines)) {
    yield bundle;
  }
}
