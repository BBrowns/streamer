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

  it("treats an HLS end far before the metadata duration as a candidate failure", () => {
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: false,
        hasSeekableHandoff: false,
        currentTime: 71,
        duration: 71,
        expectedDuration: 53 * 60,
      }),
    ).toBe(true);
  });

  it("allows an HLS source to complete near its metadata duration", () => {
    expect(
      shouldTreatPlaybackEndAsPremature({
        isProgressiveRemux: false,
        hasSeekableHandoff: false,
        currentTime: 52 * 60 + 40,
        duration: 52 * 60 + 40,
        expectedDuration: 53 * 60,
      }),
    ).toBe(false);
  });
});
