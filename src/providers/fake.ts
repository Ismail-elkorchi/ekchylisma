import { sha256Hex } from "../core/hash.ts";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.ts";

export type FakeProviderConfig = {
  responses?: Record<string, string>;
  defaultResponse?: string;
  latencyMs?: number;
};

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

export class FakeProvider implements Provider {
  name = "fake";

  private responses = new Map<string, string>();

  private defaultResponse: string;

  private latencyMs: number;

  constructor(config: FakeProviderConfig = {}) {
    this.defaultResponse = config.defaultResponse ?? '{"extractions":[]}';
    this.latencyMs = config.latencyMs ?? 0;

    if (config.responses) {
      for (const [hash, response] of Object.entries(config.responses)) {
        this.responses.set(hash, response);
      }
    }
  }

  setResponse(requestHash: string, response: string): void {
    this.responses.set(requestHash, response);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const requestHash = await hashProviderRequest(request);
    const text = this.responses.get(requestHash) ?? this.defaultResponse;

    return {
      text,
      runRecord: {
        provider: this.name,
        model: request.model,
        latencyMs: this.latencyMs,
        retries: 0,
        requestHash,
      },
    };
  }
}
