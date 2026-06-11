import * as Sentry from "@sentry/react-native";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";

describe("mobile Sentry breadcrumbs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds sanitized breadcrumbs to Sentry", () => {
    const breadcrumb = addMobileBreadcrumb({
      category: "playback",
      message:
        "open magnet:?xt=urn:btih:abcdef http://bridge.local/api/gateway/jobs/job-1/stream?signature=secret",
      data: {
        sessionId: "session-1",
        candidateId: "candidate-1",
        streamUrl: "https://resolver.example.test/movie.mp4?token=secret",
        infoHash: "abcdef",
      },
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
    expect(breadcrumb.category).toBe("streamer.playback");
    expect(breadcrumb.message).toContain("[magnet]");
    expect(breadcrumb.message).not.toContain("abcdef");
    expect(breadcrumb.data?.streamUrl).toBe("[redacted]");
    expect(breadcrumb.data?.infoHash).toBe("[redacted]");
  });
});
