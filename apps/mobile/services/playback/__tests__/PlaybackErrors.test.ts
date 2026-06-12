import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
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
});
