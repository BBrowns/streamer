import { createRedactedError, redactSensitiveText } from "../redaction";

describe("mobile redaction", () => {
  it("redacts signed stream URLs, magnets, and bearer tokens", () => {
    const output = redactSensitiveText(
      "Bearer bridge-token magnet:?xt=urn:btih:abcdef http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
    );

    expect(output).toContain("Bearer [redacted]");
    expect(output).toContain("[magnet]");
    expect(output).toContain(
      "http://127.0.0.1:11470/api/gateway/jobs/[job]/stream?[signed]",
    );
    expect(output).not.toContain("bridge-token");
    expect(output).not.toContain("abcdef");
    expect(output).not.toContain("signature=sig");
  });

  it("creates a redacted error for Sentry and callbacks", () => {
    const error = new Error(
      "Failed http://bridge.test/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
    );
    error.stack =
      "Error: Failed http://bridge.test/api/gateway/jobs/job-1/stream?expires=123&signature=sig";

    const redacted = createRedactedError(error);

    expect(redacted.message).toBe(
      "Failed http://bridge.test/api/gateway/jobs/[job]/stream?[signed]",
    );
    expect(redacted.stack).not.toContain("signature=sig");
  });
});
