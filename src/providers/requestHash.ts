import { sha256Hex } from "../core/hash.ts";
import type { ProviderRequest } from "./types.ts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export async function hashProviderRequest(
  request: ProviderRequest,
): Promise<string> {
  return sha256Hex(stableStringify(request));
}
