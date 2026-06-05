import { describe, expect, it } from "vitest";
import {
  redactSensitiveLogValue,
  redactSensitiveText,
} from "../src/utils/redaction.js";

describe("server log redaction", () => {
  it("redacts bearer tokens, magnets, and sensitive URLs in free-form text", () => {
    const input =
      "Bearer secret-token magnet:?xt=urn:btih:abcdef http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=sig https://app.test/reset-password?token=reset";

    const output = redactSensitiveText(input);

    expect(output).toContain("Bearer [redacted]");
    expect(output).toContain("[magnet]");
    expect(output).toContain(
      "http://127.0.0.1:11470/api/gateway/jobs/[job]/stream?[signed]",
    );
    expect(output).toContain("token=[redacted]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("abcdef");
    expect(output).not.toContain("signature=sig");
    expect(output).not.toContain("token=reset");
  });

  it("redacts sensitive nested log values by key", () => {
    const output = redactSensitiveLogValue({
      requestId: "req-1",
      resetToken: "reset-token",
      stream: {
        playbackUrl:
          "http://bridge.test/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
        magnet: "magnet:?xt=urn:btih:abcdef",
        title: "Example",
      },
      headers: {
        Authorization: "Bearer secret-token",
      },
    });

    expect(output).toEqual({
      requestId: "req-1",
      resetToken: "[redacted]",
      stream: {
        playbackUrl: "[redacted]",
        magnet: "[redacted]",
        title: "Example",
      },
      headers: {
        Authorization: "[redacted]",
      },
    });
  });
});
