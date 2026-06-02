import type { PlaybackPlan } from "@streamer/shared";
import { getPlaybackReadinessCopy } from "../PlaybackReadinessNotice";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: {
    glyphMap: {},
  },
}));

describe("PlaybackReadinessNotice", () => {
  it("turns bridge-required plans into a Sources & Devices action", () => {
    const plan: PlaybackPlan = {
      state: "needsBridge",
      userMessage: "Start the desktop bridge to play torrent sources.",
      debug: { rejectedCandidates: [] },
    };

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
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: {
          id: "torrent-1",
          kind: "torrent",
          stream: { infoHash: "torrent-1" },
          riskFlags: [],
        },
      },
    };

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
});
