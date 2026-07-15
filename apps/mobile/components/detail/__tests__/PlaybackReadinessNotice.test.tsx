import { fireEvent, render } from "@testing-library/react-native";
import type { PlaybackRejectReason, RejectedCandidate } from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import { mapPlaybackPlanToRuntimeFailure } from "../../../services/playback/PlaybackErrors";
import {
  getPlaybackReadinessRoute,
  getPlaybackReadinessCopy,
  getPlaybackReadinessCopyFromError,
  PlaybackReadinessNotice,
} from "../PlaybackReadinessNotice";

jest.mock("@expo/vector-icons", () => {
  const Ionicons = () => null;
  Ionicons.glyphMap = {};
  return { Ionicons };
});

function makeRejectedCandidate(
  reasonCode: PlaybackRejectReason,
  candidateId: string,
): RejectedCandidate {
  const candidate = makePlannedMediaCandidate();

  return {
    candidateId,
    title: candidateId,
    reason: reasonCode,
    reasonCode,
    requiresBridge: false,
    requiresRemux: false,
    deviceCompatibility: candidate.deviceCompatibility,
    actionEligibility: {
      action: "play",
      eligible: false,
      reason: reasonCode,
    },
  };
}

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

  it("offers Playback settings when every source is outside the quality selection", () => {
    const plan = makePlaybackPlan({
      state: "unsupported",
      rejectedCandidates: [
        makeRejectedCandidate("quality_not_allowed", "source-2160"),
        makeRejectedCandidate("quality_not_allowed", "source-720"),
      ],
    });

    const notice = getPlaybackReadinessCopy(
      plan,
      "No playable source.",
      "play",
    );

    expect(notice).toMatchObject({
      title: "No source matches your quality choices",
      message:
        "Available sources fall outside the video qualities selected in Playback settings.",
      detail: "Allow another quality, then try playback again.",
      primaryActionLabel: "Playback settings",
      primaryActionTarget: "playbackSettings",
    });
    expect(getPlaybackReadinessRoute(notice.primaryActionTarget!)).toBe(
      "/settings/playback",
    );
  });

  it("keeps mixed unsupported causes on generic device guidance", () => {
    const plan = makePlaybackPlan({
      state: "unsupported",
      rejectedCandidates: [
        makeRejectedCandidate("quality_not_allowed", "source-2160"),
        makeRejectedCandidate("unsupported_container", "source-mkv"),
      ],
    });

    expect(
      getPlaybackReadinessCopy(plan, "No playable source.", "play"),
    ).toMatchObject({
      title: "No compatible viewing option",
      primaryActionLabel: "Sources & Devices",
      primaryActionTarget: "sourcesDevices",
    });
  });

  it("keeps the quality recovery target on the runtime error path", () => {
    const plan = makePlaybackPlan({
      state: "unsupported",
      userMessage: "No source matches the selected video qualities.",
      rejectedCandidates: [
        makeRejectedCandidate("quality_not_allowed", "source-2160"),
      ],
    });
    const failure = mapPlaybackPlanToRuntimeFailure(
      plan,
      "Playback unavailable.",
    );
    const notice = getPlaybackReadinessCopyFromError(failure.error, "play");
    const onPrimaryAction = jest.fn();
    const { getByText } = render(
      <PlaybackReadinessNotice
        notice={notice}
        onDismiss={jest.fn()}
        onPrimaryAction={onPrimaryAction}
      />,
    );

    fireEvent.press(getByText("Playback settings"));

    expect(onPrimaryAction).toHaveBeenCalledWith("playbackSettings");
  });
});
