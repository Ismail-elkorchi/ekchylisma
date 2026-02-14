import { ProviderError, classifyProviderStatus } from "./errors.ts";
import { hashProviderRequest } from "./requestHash.ts";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.ts";

export type OllamaProviderConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetchFn?: typeof fetch;
};

function ensureFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (!resolved) {
    throw new Error("fetch is required for OllamaProvider.");
  }

  return resolved;
}

function extractText(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    throw new ProviderError("permanent", "parse_error", "Ollama response is not an object.");
  }

  const content = (response as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== "string") {
    throw new ProviderError("permanent", "parse_error", "Ollama response missing message content.");
  }

  return content;
}

export class OllamaProvider implements Provider {
  name = "ollama";

  private config: OllamaProviderConfig;

  constructor(config: OllamaProviderConfig = {}) {
    this.config = config;
  }

  async generate(
    request: ProviderRequest,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    const fetchFn = ensureFetch(options.fetchFn ?? this.config.fetchFn);
    const startedAt = Date.now();
    const url = `${(this.config.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "")}/api/chat`;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
      stream: false,
      format: request.schema ?? "json",
    };

    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new ProviderError(
        classifyProviderStatus(response.status),
        `http_${response.status}`,
        `Ollama request failed with status ${response.status}`,
        response.status,
      );
    }

    const data = await response.json();
    const text = extractText(data);
    const requestHash = await hashProviderRequest(request);

    return {
      text,
      runRecord: {
        provider: this.name,
        model: request.model,
        latencyMs: Date.now() - startedAt,
        retries: this.config.retries ?? 0,
        requestHash,
      },
    };
  }
}
