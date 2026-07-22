import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
  mapPlaybackPlanToRuntimeFailure,
  mapPlaybackMessageToRuntimeFailure,
} from "../PlaybackErrors";
import type { PlaybackRejectReason, RejectedCandidate } from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";

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

describe("PlaybackErrors", () => {
  it("maps no playable source to a dedicated terminal runtime state", () => {
    const error = createPlaybackRuntimeError("NO_PLAYABLE_SOURCE");

    expect(error).toMatchObject({
      code: "NO_PLAYABLE_SOURCE",
      message: "No playable source worked for this title.",
      retryable: true,
      shouldFallback: false,
    });
    expect(getPlaybackRuntimeState("NO_PLAYABLE_SOURCE")).toBe(
      "failed_no_playable_source",
    );
  });

  it("maps a stalled stream gateway to a recoverable gateway timeout", () => {
    const result = mapPlaybackMessageToRuntimeFailure(
      "Stream gateway stalled while preparing this source.",
      "SOURCE_UNAVAILABLE",
    );

    expect(result.error).toMatchObject({
      code: "GATEWAY_TIMEOUT",
      retryable: true,
      shouldFallback: true,
    });
    expect(result.runtimeState).toBe("failed_timeout");
  });

  it("keeps metadata stalls separate from a source with no peers", () => {
    const result = mapPlaybackMessageToRuntimeFailure(
      "Torrent metadata was not ready in time.",
      "SOURCE_UNAVAILABLE",
    );

    expect(result.error).toMatchObject({
      code: "GATEWAY_TIMEOUT",
      retryable: true,
      shouldFallback: true,
    });
    expect(result.runtimeState).toBe("failed_timeout");
  });

  it("preserves an exclusively quality-filtered planner failure", () => {
    const plan = makePlaybackPlan({
      state: "unsupported",
      userMessage: "No source matches the selected video qualities.",
      rejectedCandidates: [
        makeRejectedCandidate("quality_not_allowed", "source-2160"),
        makeRejectedCandidate("quality_not_allowed", "source-720"),
      ],
    });

    const result = mapPlaybackPlanToRuntimeFailure(
      plan,
      "Playback unavailable.",
    );

    expect(result).toMatchObject({
      runtimeState: "failed_no_playable_source",
      error: {
        code: "NO_PLAYABLE_SOURCE",
        message: "No source matches the selected video qualities.",
        retryable: false,
        shouldFallback: false,
        reasonCode: "quality_not_allowed",
      },
    });
  });

  it("keeps mixed quality and compatibility failures generic", () => {
    const plan = makePlaybackPlan({
      state: "unsupported",
      userMessage: "No compatible source is available.",
      rejectedCandidates: [
        makeRejectedCandidate("quality_not_allowed", "source-2160"),
        makeRejectedCandidate("unsupported_container", "source-mkv"),
      ],
    });

    const result = mapPlaybackPlanToRuntimeFailure(
      plan,
      "Playback unavailable.",
    );

    expect(result.error).toMatchObject({
      code: "UNSUPPORTED_CODEC",
      message: "No compatible source is available.",
    });
    expect(result.error.reasonCode).toBeUndefined();
    expect(result.runtimeState).toBe("failed_unsupported_codec");
  });
});
