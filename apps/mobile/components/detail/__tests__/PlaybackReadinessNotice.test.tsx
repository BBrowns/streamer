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
      title: "Desktop bridge required",
      message: "Start the desktop bridge to play torrent sources.",
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
      title: "Playback source failed",
      message: "This stream is not playable.",
      detail: "Tried 1 source. No peers found",
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
      title: "Bridge needs repair",
      message: "Bridge is running but the streaming engine is unavailable.",
      tone: "error",
      primaryActionLabel: "Sources & Devices",
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
      title: "Source has no peers",
      detail: "Tried 1 source. No peers found",
      tone: "warning",
    });
  });
});
