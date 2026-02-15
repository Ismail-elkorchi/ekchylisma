import type { JsonSchemaSubset } from "../core/types.ts";

export type ProviderRequest = {
  model: string;
  prompt: string;
  schema?: JsonSchemaSubset;
  metadata?: Record<string, string>;
  timeoutMs?: number;
};

export type ProviderRunRecord = {
  provider: string;
  model: string;
  latencyMs: number;
  retries: number;
  requestHash: string;
};

export type ProviderResponse = {
  text: string;
  runRecord: ProviderRunRecord;
};

export interface Provider {
  name: string;
  generate(
    request: ProviderRequest,
    options?: { fetchFn?: typeof fetch },
  ): Promise<ProviderResponse>;
  generateStructured(
    request: ProviderRequest,
    options?: { fetchFn?: typeof fetch },
  ): Promise<ProviderResponse>;
}
