import {
  createMobileSentryConfig,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
} from "../sentryConfig";

describe("mobile Sentry config", () => {
  it("disables Sentry in development by default even when a DSN exists", () => {
    const config = createMobileSentryConfig({
      dsn: "https://public@example.ingest.sentry.io/1",
      appVersion: "1.2.3",
      isDev: true,
      nodeEnv: "development",
    });

    expect(config.enabled).toBe(false);
    expect(config.release).toBe("streamer-mobile@1.2.3");
    expect(config.environment).toBe("development");
    expect(config.tracesSampleRate).toBe(0);
    expect(config.sendDefaultPii).toBe(false);
  });

  it("uses build metadata for release and environment", () => {
    const config = createMobileSentryConfig({
      dsn: "https://public@example.ingest.sentry.io/1",
      isDev: false,
      nodeEnv: "production",
      buildMetadata: {
        appVersion: "2.0.0",
        gitSha: "1234567890abcdef",
        gitShaShort: "1234567890ab",
        buildDate: "2026-06-11T10:00:00.000Z",
        buildChannel: "beta",
        runtimeType: "desktop-renderer",
        environment: "preview",
        release: "streamer-desktop-renderer@2.0.0+1234567890ab",
      },
    });

    expect(config.environment).toBe("preview");
    expect(config.release).toBe("streamer-desktop-renderer@2.0.0+1234567890ab");
  });

  it("enables production Sentry with conservative default tracing", () => {
    const config = createMobileSentryConfig({
      dsn: "https://public@example.ingest.sentry.io/1",
      appVersion: "1.2.3",
      isDev: false,
      nodeEnv: "production",
    });

    expect(config.enabled).toBe(true);
    expect(config.environment).toBe("production");
    expect(config.tracesSampleRate).toBe(0.1);
    expect(config.sampleRate).toBe(1);
  });

  it("redacts sensitive event fields and removes user PII", () => {
    const event = sanitizeSentryEvent({
      message:
        "Failed magnet:?xt=urn:btih:abcdef http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
      extra: {
        Authorization: "Bearer bridge-token",
        localUri: "streamer://offline/movie.mp4",
        safe: "request-1",
      },
      user: {
        id: "user-1",
        email: "user@example.com",
        ip_address: "127.0.0.1",
      },
    });

    expect(event.message).toContain("[magnet]");
    expect(event.message).not.toContain("abcdef");
    expect(event.message).not.toContain("signature=sig");
    expect(event.extra.Authorization).toBe("[redacted]");
    expect(event.extra.localUri).toBe("[redacted]");
    expect(event.extra.safe).toBe("request-1");
    expect(event.user).toEqual({ id: "user-1" });
  });

  it("redacts breadcrumbs before Sentry stores them", () => {
    const breadcrumb = sanitizeSentryBreadcrumb({
      category: "fetch",
      message:
        "GET http://bridge.local/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
      data: {
        url: "http://bridge.local/api/gateway/jobs/job-1/stream?expires=123&signature=sig",
        token: "secret",
      },
    });

    expect(breadcrumb?.message).toContain("/api/gateway/jobs/[job]/stream");
    expect(breadcrumb?.message).not.toContain("signature=sig");
    expect(breadcrumb?.data.url).toContain("/api/gateway/jobs/[job]/stream");
    expect(breadcrumb?.data.token).toBe("[redacted]");
  });
});
