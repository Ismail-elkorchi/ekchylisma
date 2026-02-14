import { ProviderError, classifyProviderStatus } from "./errors.ts";
import { hashProviderRequest } from "./requestHash.ts";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.ts";

export type OpenAIProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  timeoutMs?: number;
  retries?: number;
  fetchFn?: typeof fetch;
};

function ensureFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (!resolved) {
    throw new Error("fetch is required for OpenAIProvider.");
  }

  return resolved;
}

function extractText(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    throw new ProviderError("permanent", "parse_error", "OpenAI response is not an object.");
  }

  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError("permanent", "parse_error", "OpenAI response missing choices.");
  }

  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry === "object" && entry !== null ? (entry as { text?: string }).text : ""))
      .filter(Boolean)
      .join("\n");
  }

  throw new ProviderError("permanent", "parse_error", "OpenAI response missing message content.");
}

export class OpenAIProvider implements Provider {
  name = "openai";

  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  async generate(
    request: ProviderRequest,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    const fetchFn = ensureFetch(options.fetchFn ?? this.config.fetchFn);
    const startedAt = Date.now();
    const url = `${(this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
    };

    if (request.schema) {
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name: "ekchylisma_extraction",
          schema: request.schema,
          strict: true,
        },
      };
    }

    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.organization
          ? { "openai-organization": this.config.organization }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new ProviderError(
        classifyProviderStatus(response.status),
        `http_${response.status}`,
        `OpenAI request failed with status ${response.status}`,
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
