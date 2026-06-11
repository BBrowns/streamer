import { describe, expect, it } from "vitest";
import { createServerSentryOptionsFromInput } from "../src/services/sentry.service.js";

describe("server Sentry config", () => {
  it("is disabled without a DSN and in tests", () => {
    expect(
      createServerSentryOptionsFromInput({
        nodeEnv: "production",
        packageVersion: "1.2.3",
      }).enabled,
    ).toBe(false);

    expect(
      createServerSentryOptionsFromInput({
        dsn: "https://public@example.ingest.sentry.io/1",
        nodeEnv: "test",
        packageVersion: "1.2.3",
      }).enabled,
    ).toBe(false);
  });

  it("uses conservative production tracing and disables default PII", () => {
    const options = createServerSentryOptionsFromInput({
      dsn: "https://public@example.ingest.sentry.io/1",
      nodeEnv: "production",
      packageVersion: "1.2.3",
    });

    expect(options.enabled).toBe(true);
    expect(options.environment).toBe("production");
    expect(options.release).toBe("streamer-server@1.2.3");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0.05);
    expect(options.sampleRate).toBe(1);
  });

  it("uses build metadata for release and environment", () => {
    const options = createServerSentryOptionsFromInput({
      dsn: "https://public@example.ingest.sentry.io/1",
      nodeEnv: "production",
      buildMetadata: {
        appVersion: "2.0.0",
        gitSha: "1234567890abcdef",
        gitShaShort: "1234567890ab",
        buildDate: "2026-06-11T10:00:00.000Z",
        buildChannel: "beta",
        runtimeType: "server",
        environment: "preview",
        release: "streamer-server@2.0.0+1234567890ab",
      },
    });

    expect(options.environment).toBe("preview");
    expect(options.release).toBe("streamer-server@2.0.0+1234567890ab");
  });

  it("redacts sensitive event payloads before sending", () => {
    const options = createServerSentryOptionsFromInput({
      dsn: "https://public@example.ingest.sentry.io/1",
      nodeEnv: "production",
      packageVersion: "1.2.3",
    });

    const event = options.beforeSend?.(
      {
        message:
          "Failed magnet:?xt=urn:btih:abcdef http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
        extra: {
          Authorization: "Bearer bridge-token",
          localUri: "streamer://offline/movie.mp4",
          requestId: "req-1",
        },
        user: {
          id: "user-1",
          email: "user@example.com",
          ip_address: "127.0.0.1",
        },
      } as any,
      {},
    ) as any;

    expect(event?.message).toContain("[magnet]");
    expect(event?.message).not.toContain("abcdef");
    expect(event?.message).not.toContain("signature=sig");
    expect(event?.extra?.Authorization).toBe("[redacted]");
    expect(event?.extra?.localUri).toBe("[redacted]");
    expect(event?.extra?.requestId).toBe("req-1");
    expect(event?.user).toEqual({ id: "user-1" });
  });

  it("redacts breadcrumbs before storing them", () => {
    const options = createServerSentryOptionsFromInput({
      dsn: "https://public@example.ingest.sentry.io/1",
      nodeEnv: "production",
      packageVersion: "1.2.3",
    });

    const breadcrumb = options.beforeBreadcrumb?.(
      {
        category: "http",
        message:
          "GET http://bridge.local/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
        data: {
          token: "secret",
          url: "http://bridge.local/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
        },
      } as any,
      {},
    ) as any;

    expect(breadcrumb?.message).toContain("/api/gateway/jobs/[job]/stream");
    expect(breadcrumb?.message).not.toContain("signature=sig");
    expect(breadcrumb?.data?.token).toBe("[redacted]");
    expect(String(breadcrumb?.data?.url)).toContain(
      "/api/gateway/jobs/[job]/stream",
    );
  });
});
