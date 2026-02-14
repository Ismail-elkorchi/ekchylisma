export type ProviderErrorKind = "transient" | "permanent";

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  code: string;
  status?: number;

  constructor(
    kind: ProviderErrorKind,
    code: string,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.code = code;
    this.status = status;
  }
}

export function classifyProviderStatus(status: number): ProviderErrorKind {
  if (status === 408 || status === 429 || status >= 500) {
    return "transient";
  }

  return "permanent";
}

export function isTransientProviderError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.kind === "transient";
  }

  if (typeof error === "object" && error !== null) {
    const transient = (error as { transient?: unknown }).transient;
    return transient === true;
  }

  return false;
}
