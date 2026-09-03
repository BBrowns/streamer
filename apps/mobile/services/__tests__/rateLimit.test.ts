import {
  MAX_RATE_LIMIT_COOLDOWN_MS,
  RateLimitError,
  isRateLimitError,
  parseRetryAfterMs,
  toRateLimitError,
} from "../rateLimit";

describe("rate limit handling", () => {
  it("parses seconds and clamps an untrusted cooldown", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000);
    expect(parseRetryAfterMs("999999")).toBe(MAX_RATE_LIMIT_COOLDOWN_MS);
  });

  it("parses HTTP dates and never exposes response details", () => {
    const now = Date.parse("2026-08-31T10:00:00.000Z");
    expect(parseRetryAfterMs("Mon, 31 Aug 2026 10:00:05 GMT", now)).toBe(5_000);

    const error = toRateLimitError({
      response: {
        status: 429,
        headers: { "retry-after": "4" },
        data: { token: "must-not-be-copied" },
      },
      config: { url: "https://private.example/secret" },
    });

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error?.retryAfterMs).toBe(4_000);
    expect(error?.message).toBe("Too many requests");
    expect(error).not.toHaveProperty("url");
    expect(error).not.toHaveProperty("token");
  });

  it("only identifies the typed cooldown error", () => {
    expect(isRateLimitError(new RateLimitError(1_000))).toBe(true);
    expect(isRateLimitError(new Error("429"))).toBe(false);
    expect(toRateLimitError({ response: { status: 500 } })).toBeNull();
  });
});
