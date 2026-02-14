export type RetryPolicy = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export function normalizeRetryPolicy(policy: RetryPolicy): RetryPolicy {
  if (!Number.isInteger(policy.attempts) || policy.attempts < 1) {
    throw new Error("Retry policy attempts must be >= 1.");
  }

  if (policy.baseDelayMs < 0 || policy.maxDelayMs < 0) {
    throw new Error("Retry policy delays must be non-negative.");
  }

  if (policy.maxDelayMs < policy.baseDelayMs) {
    throw new Error("maxDelayMs must be >= baseDelayMs.");
  }

  if (policy.jitterRatio < 0 || policy.jitterRatio > 1) {
    throw new Error("jitterRatio must be between 0 and 1.");
  }

  return {
    attempts: policy.attempts,
    baseDelayMs: policy.baseDelayMs,
    maxDelayMs: policy.maxDelayMs,
    jitterRatio: policy.jitterRatio,
  };
}

export function computeBackoffMs(policy: RetryPolicy, attempt: number): number {
  const normalized = normalizeRetryPolicy(policy);
  const exponent = Math.max(0, attempt - 1);
  const raw = normalized.baseDelayMs * 2 ** exponent;
  return Math.min(normalized.maxDelayMs, raw);
}

export function computeJitterMs(
  backoffMs: number,
  jitterRatio: number,
  randomValue: number,
): number {
  if (jitterRatio === 0 || backoffMs === 0) {
    return 0;
  }

  const clamped = Math.min(1, Math.max(0, randomValue));
  const maxJitter = backoffMs * jitterRatio;
  return Math.round(maxJitter * clamped);
}

export function computeRetryDelayMs(
  policy: RetryPolicy,
  attempt: number,
  randomValue: number,
): number {
  const normalized = normalizeRetryPolicy(policy);
  const backoff = computeBackoffMs(normalized, attempt);
  const jitter = computeJitterMs(backoff, normalized.jitterRatio, randomValue);
  return backoff + jitter;
}

export function shouldRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
  isTransientError: (error: unknown) => boolean,
): boolean {
  const normalized = normalizeRetryPolicy(policy);
  if (attempt >= normalized.attempts) {
    return false;
  }

  return isTransientError(error);
}
