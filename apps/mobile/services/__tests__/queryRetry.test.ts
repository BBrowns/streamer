import { AuthRefreshError } from "../api";
import { shouldRetryQuery } from "../queryRetry";
import { RateLimitError } from "../rateLimit";

describe("shouldRetryQuery", () => {
  it("does not immediately retry rate-limited or auth-refresh failures", () => {
    expect(shouldRetryQuery(0, new RateLimitError(7_000))).toBe(false);
    expect(shouldRetryQuery(0, new AuthRefreshError("network"))).toBe(false);
  });

  it("keeps ordinary query retries bounded", () => {
    expect(shouldRetryQuery(0, new Error("temporary"))).toBe(true);
    expect(shouldRetryQuery(2, new Error("temporary"))).toBe(true);
    expect(shouldRetryQuery(3, new Error("temporary"))).toBe(false);
  });
});
