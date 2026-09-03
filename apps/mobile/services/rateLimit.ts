const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
export const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

function clampCooldown(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return Math.min(Math.max(Math.round(value), 0), MAX_RATE_LIMIT_COOLDOWN_MS);
}

/** Parse an HTTP Retry-After value without retaining request or response data. */
export function parseRetryAfterMs(value: unknown, now = Date.now()): number {
  if (typeof value === "number") {
    return clampCooldown(value * 1000);
  }

  if (typeof value !== "string") return DEFAULT_RATE_LIMIT_COOLDOWN_MS;

  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return clampCooldown(seconds * 1000);

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return clampCooldown(timestamp - now);
}

export class RateLimitError extends Error {
  readonly name = "RateLimitError";
  readonly status = 429;
  readonly retryAfterMs: number;

  constructor(retryAfterMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS) {
    super("Too many requests");
    this.retryAfterMs = clampCooldown(retryAfterMs);
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

function readRetryAfter(headers: unknown): unknown {
  if (!headers || typeof headers !== "object") return undefined;

  const candidate = headers as {
    get?: (name: string) => unknown;
    [key: string]: unknown;
  };
  return (
    candidate.get?.("Retry-After") ??
    candidate.get?.("retry-after") ??
    candidate["Retry-After"] ??
    candidate["retry-after"]
  );
}

export function toRateLimitError(error: unknown): RateLimitError | null {
  if (!error || typeof error !== "object") return null;

  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;

  const status = (response as { status?: unknown }).status;
  if (status !== 429) return null;

  return new RateLimitError(
    parseRetryAfterMs(
      readRetryAfter((response as { headers?: unknown }).headers),
    ),
  );
}
