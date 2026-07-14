import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
  mapPlaybackMessageToRuntimeFailure,
} from "../PlaybackErrors";

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
});
