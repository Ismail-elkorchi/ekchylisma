import type { Provider, ProviderResponse, ProviderRequest } from "./types.ts";
import { hashProviderRequest } from "./requestHash.ts";

export type FakeProviderConfig = {
  responses?: Record<string, string>;
  defaultResponse?: string;
  latencyMs?: number;
};

export { hashProviderRequest };

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
