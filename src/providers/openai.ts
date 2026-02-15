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

function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "object" && entry !== null) {
          const record = entry as { text?: unknown };
          return typeof record.text === "string" ? record.text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractPayload(response: unknown): { text: string; outputChannel: "text" | "tool_call" } {
  if (typeof response !== "object" || response === null) {
    throw new ProviderError("permanent", "parse_error", "OpenAI response is not an object.");
  }

  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError("permanent", "parse_error", "OpenAI response missing choices.");
  }

  const message = (choices[0] as {
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
      if (typeof argumentsValue === "string" && argumentsValue.trim().length > 0) {
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

  const content = extractContentText(message?.content);
  if (content.length > 0) {
    return {
      text: content,
      outputChannel: "text",
    };
  }

  throw new ProviderError("permanent", "parse_error", "OpenAI response missing message content.");
}

export class OpenAIProvider implements Provider {
  name = "openai";

  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  private async generateInternal(
    request: ProviderRequest,
    structured: boolean,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    const fetchFn = ensureFetch(options.fetchFn ?? this.config.fetchFn);
    const startedAt = Date.now();
    const url = `${(this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
    };

    if (structured && request.schema) {
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
