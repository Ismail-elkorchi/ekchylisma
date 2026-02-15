import { ProviderError, classifyProviderStatus } from "./errors.ts";
import { hashProviderRequest } from "./requestHash.ts";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.ts";

export type GeminiProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetchFn?: typeof fetch;
};

function ensureFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (!resolved) {
    throw new Error("fetch is required for GeminiProvider.");
  }

  return resolved;
}

function extractPayload(response: unknown): { text: string; outputChannel: "text" | "tool_call" } {
  if (typeof response !== "object" || response === null) {
    throw new ProviderError("permanent", "parse_error", "Gemini response is not an object.");
  }

  const candidates = (response as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ProviderError("permanent", "parse_error", "Gemini response missing candidates.");
  }

  const parts = (candidates[0] as {
    content?: {
      parts?: Array<{
        text?: unknown;
        functionCall?: {
          args?: unknown;
        };
      }>;
    };
  }).content?.parts;
  if (!Array.isArray(parts)) {
    throw new ProviderError("permanent", "parse_error", "Gemini response missing content parts.");
  }

  for (const part of parts) {
    const argumentsValue = part.functionCall?.args;
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

  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  if (text.length === 0) {
    throw new ProviderError("permanent", "parse_error", "Gemini response contains empty text.");
  }

  return {
    text,
    outputChannel: "text",
  };
}

export class GeminiProvider implements Provider {
  name = "gemini";

  private config: GeminiProviderConfig;

  constructor(config: GeminiProviderConfig) {
    this.config = config;
  }

  private async generateInternal(
    request: ProviderRequest,
    structured: boolean,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<ProviderResponse> {
    const fetchFn = ensureFetch(options.fetchFn ?? this.config.fetchFn);
    const startedAt = Date.now();
    const root = (this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
    const url = `${root}/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    const payload: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: request.prompt }],
        },
      ],
    };

    if (structured && request.schema) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: request.schema,
      };
    }

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
        `Gemini request failed with status ${response.status}`,
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
