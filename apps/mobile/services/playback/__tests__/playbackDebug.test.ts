import * as Sentry from "@sentry/react-native";
import { recordPlaybackDebugEvent } from "../playbackDebug";

describe("playback debug events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds only a sanitized boundary summary", () => {
    recordPlaybackDebugEvent({
      category: "gateway",
      message: "gateway.job_failed",
      data: {
        executionTarget: "local-sidecar",
        sourceUrl: "https://resolver.example.test/video.mp4?token=secret",
        infoHash: "abcdef",
      },
    });

    const breadcrumb = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(breadcrumb.data).toMatchObject({
      executionTarget: "local-sidecar",
      sourceUrl: "[redacted]",
      infoHash: "[redacted]",
    });
    expect(JSON.stringify(breadcrumb)).not.toContain("resolver.example.test");
    expect(JSON.stringify(breadcrumb)).not.toContain("abcdef");
  });
});
