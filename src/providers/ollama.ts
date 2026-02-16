import { classifyProviderStatus, ProviderError } from "./errors.ts";
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

function extractPayload(
  response: unknown,
): { text: string; outputChannel: "text" | "tool_call" } {
  if (typeof response !== "object" || response === null) {
    throw new ProviderError(
      "permanent",
      "parse_error",
      "Ollama response is not an object.",
    );
  }

  const message = (response as {
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        function?: {
          arguments?: unknown;
        };
      }>;
    };
  }).message;

  if (Array.isArray(message?.tool_calls)) {
    for (const call of message.tool_calls) {
      const argumentsValue = call?.function?.arguments;
      if (
        typeof argumentsValue === "string" && argumentsValue.trim().length > 0
      ) {
        return {
          text: argumentsValue,
          outputChannel: "tool_call",
        };
      }
      if (typeof argumentsValue === "object" && argumentsValue !== null) {
        return {
          text: JSON.stringify(argumentsValue),
          outputChannel: "tool_call",
        };
      }
    }
  }

  const content = message?.content;
  if (typeof content !== "string") {
    throw new ProviderError(
      "permanent",
      "parse_error",
      "Ollama response missing message content.",
    );
  }

  return {
    text: content,
    outputChannel: "text",
  };
}

export class OllamaProvider implements Provider {
  name = "ollama";

  private config: OllamaProviderConfig;

  constructor(config: OllamaProviderConfig = {}) {
    this.config = config;
  }

  private async generateInternal(
    request: ProviderRequest,
    structured: boolean,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    const fetchFn = ensureFetch(options.fetchFn ?? this.config.fetchFn);
    const startedAt = Date.now();
    const url = `${
      (this.config.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "")
    }/api/chat`;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
      stream: false,
      format: structured ? (request.schema ?? "json") : "json",
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
    const payloadText = extractPayload(data);
    const requestHash = await hashProviderRequest(request);

    return {
      text: payloadText.text,
      outputChannel: payloadText.outputChannel,
      runRecord: {
        provider: this.name,
        model: request.model,
        latencyMs: Date.now() - startedAt,
        retries: this.config.retries ?? 0,
        requestHash,
      },
    };
  }

  async generate(
    request: ProviderRequest,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    return this.generateInternal(request, false, options);
  }

  async generateStructured(
    request: ProviderRequest,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    return this.generateInternal(request, true, options);
  }
}
