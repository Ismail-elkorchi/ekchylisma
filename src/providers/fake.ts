import type { Provider, ProviderResponse, ProviderRequest } from "./types.ts";
import { hashProviderRequest } from "./requestHash.ts";

export type FakeProviderConfig = {
  responses?: Record<string, string>;
  structuredResponses?: Record<string, string>;
  defaultResponse?: string;
  structuredDefaultResponse?: string;
  latencyMs?: number;
};

export { hashProviderRequest };

export class FakeProvider implements Provider {
  name = "fake";

  private responses = new Map<string, string>();

  private structuredResponses = new Map<string, string>();

  private defaultResponse: string;

  private structuredDefaultResponse: string;

  private latencyMs: number;

  constructor(config: FakeProviderConfig = {}) {
    this.defaultResponse = config.defaultResponse ?? '{"extractions":[]}';
    this.structuredDefaultResponse = config.structuredDefaultResponse ?? this.defaultResponse;
    this.latencyMs = config.latencyMs ?? 0;

    if (config.responses) {
      for (const [hash, response] of Object.entries(config.responses)) {
        this.responses.set(hash, response);
      }
    }

    if (config.structuredResponses) {
      for (const [hash, response] of Object.entries(config.structuredResponses)) {
        this.structuredResponses.set(hash, response);
      }
    }
  }

  setResponse(requestHash: string, response: string): void {
    this.responses.set(requestHash, response);
  }

  setStructuredResponse(requestHash: string, response: string): void {
    this.structuredResponses.set(requestHash, response);
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

  async generateStructured(request: ProviderRequest): Promise<ProviderResponse> {
    const requestHash = await hashProviderRequest(request);
    const text = this.structuredResponses.get(requestHash)
      ?? this.responses.get(requestHash)
      ?? this.structuredDefaultResponse;

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
