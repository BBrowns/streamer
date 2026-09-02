import { shouldTreatPlaybackEndAsPremature } from "../PlaybackEndPolicy";

describe("progressive playback end policy", () => {
  it("treats an unknown-duration end before the seekable handoff as a candidate failure", () => {
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: true,
        hasSeekableHandoff: false,
        currentTime: 18,
        duration: Number.POSITIVE_INFINITY,
      }),
    ).toBe(true);
  });

  it("preserves completion after a seekable handoff or known endpoint", () => {
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: true,
        hasSeekableHandoff: true,
        currentTime: 18,
        duration: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: true,
        hasSeekableHandoff: false,
        currentTime: 119.8,
        duration: 120,
      }),
    ).toBe(false);
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: false,
        hasSeekableHandoff: false,
        currentTime: 18,
        duration: 0,
      }),
    ).toBe(false);
  });
});
