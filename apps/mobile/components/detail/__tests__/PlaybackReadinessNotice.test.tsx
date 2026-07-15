import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  getPlaybackReadinessCopy,
  getPlaybackReadinessCopyFromError,
} from "../PlaybackReadinessNotice";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: {
    glyphMap: {},
  },
}));

describe("PlaybackReadinessNotice", () => {
  it("turns bridge-required plans into a Sources & Devices action", () => {
    const plan = makePlaybackPlan({
      state: "needsBridge",
      userMessage: "Start the desktop bridge to play torrent sources.",
      debug: { rejectedCandidates: [] },
    });

    expect(
      getPlaybackReadinessCopy(plan, "Not playable", "play"),
    ).toMatchObject({
      title: "Finish playback setup",
      message: "Connect the desktop app to play this title.",
      tone: "warning",
      primaryActionLabel: "Sources & Devices",
    });
  });

  it("summarizes failed ready plans with resolve diagnostics", () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: makePlannedMediaCandidate({
          id: "torrent-1",
          kind: "torrent",
          stream: { infoHash: "torrent-1" },
          requiresBridge: true,
        }),
      },
    });

    expect(
      getPlaybackReadinessCopy(plan, "This stream is not playable.", "play", [
        "No peers found",
      ]),
    ).toMatchObject({
      title: "Trying another viewing option",
      message: "This stream is not playable.",
      detail: "1 other viewing option was also tried.",
      tone: "warning",
    });
  });

  it("turns typed bridge runtime errors into repair guidance", () => {
    expect(
      getPlaybackReadinessCopyFromError(
        {
          code: "BRIDGE_UNSUPPORTED",
          message: "Bridge is running but the streaming engine is unavailable.",
          retryable: false,
          shouldFallback: false,
        },
        "play",
      ),
    ).toMatchObject({
      title: "Playback setup needs attention",
      message: "Review this device before trying playback again.",
      detail: "Direct viewing options may still work on this device.",
      tone: "error",
      primaryActionLabel: "Sources & Devices",
    });
  });

  it("uses download-specific bridge repair guidance", () => {
    expect(
      getPlaybackReadinessCopyFromError(
        {
          code: "BRIDGE_UNSUPPORTED",
          message:
            "Desktop bridge needs repair before torrent sources can play on this device.",
          retryable: false,
          shouldFallback: false,
        },
        "download",
      ),
    ).toMatchObject({
      title: "Playback setup needs attention",
      message: "Review this device before trying the download again.",
      detail: "Direct viewing options may still work on this device.",
      tone: "error",
    });
  });

  it("turns typed peer runtime errors into source guidance", () => {
    expect(
      getPlaybackReadinessCopyFromError(
        {
          code: "NO_PEERS",
          message: "This source did not find enough peers to start playback.",
          retryable: true,
          shouldFallback: true,
        },
        "play",
        ["No peers found"],
      ),
    ).toMatchObject({
      title: "Viewing option unavailable",
      detail: "1 other viewing option was also tried.",
      tone: "warning",
    });
  });
});
