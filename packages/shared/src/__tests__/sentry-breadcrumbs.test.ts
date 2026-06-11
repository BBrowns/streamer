import { describe, expect, it } from "vitest";
import {
  createStreamerBreadcrumb,
  sanitizeSentryBreadcrumbData,
} from "../sentry-breadcrumbs";

describe("Sentry breadcrumbs", () => {
  it("creates namespaced privacy-safe breadcrumbs", () => {
    const breadcrumb = createStreamerBreadcrumb({
      category: "playback",
      message:
        "Trying magnet:?xt=urn:btih:abcdef at http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?signature=secret",
      level: "warning",
      data: {
        sessionId: "session-1",
        candidateId: "candidate-1",
        candidateRank: 2,
        candidateKind: "torrent",
        infoHash: "abcdef",
        playbackUrl: "https://resolver.example.test/video.mp4?token=secret",
        localUri: "/Users/alice/Movies/movie.mp4",
        authorization: "Bearer secret",
      },
    });

    expect(breadcrumb).toMatchObject({
      category: "streamer.playback",
      level: "warning",
      data: {
        sessionId: "session-1",
        candidateId: "candidate-1",
        candidateRank: 2,
        candidateKind: "torrent",
        infoHash: "[redacted]",
        playbackUrl: "[redacted]",
        localUri: "[redacted]",
        authorization: "[redacted]",
      },
    });
    expect(breadcrumb.message).toContain("[magnet]");
    expect(breadcrumb.message).toContain("/api/gateway/jobs/[job]/stream");
    expect(breadcrumb.message).not.toContain("abcdef");
    expect(breadcrumb.message).not.toContain("signature=secret");
  });

  it("keeps operational state while truncating large payloads", () => {
    const sanitized = sanitizeSentryBreadcrumbData({
      phase: "remuxing",
      peerCount: 3,
      retryable: true,
      nested: {
        sourceUrl: "https://cdn.example.test/file.mp4",
        notes: "x".repeat(300),
      },
      attempts: Array.from({ length: 30 }, (_, index) => index),
    }) as any;

    expect(sanitized.phase).toBe("remuxing");
    expect(sanitized.peerCount).toBe(3);
    expect(sanitized.retryable).toBe(true);
    expect(sanitized.nested.sourceUrl).toBe("[redacted]");
    expect(sanitized.nested.notes).toHaveLength(240);
    expect(sanitized.attempts).toHaveLength(20);
  });
});
