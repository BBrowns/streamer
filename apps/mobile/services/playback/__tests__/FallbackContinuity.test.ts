import {
  captureFallbackContinuity,
  resolveFallbackResumePosition,
} from "../FallbackContinuity";

describe("fallback playback continuity", () => {
  it("captures only accepted position and viewer intent", () => {
    expect(
      captureFallbackContinuity({
        currentTime: 133.5,
        isPlaying: false,
        sourceUri: "runtime-only-uri",
        attempt: 2,
      }),
    ).toEqual({
      resumeAt: 133.5,
      shouldPlay: false,
      sourceUri: "runtime-only-uri",
      attempt: 2,
    });
  });

  it("clamps restoration to the replacement source duration", () => {
    const snapshot = captureFallbackContinuity({
      currentTime: 133.5,
      isPlaying: true,
      sourceUri: null,
      attempt: 1,
    });
    expect(resolveFallbackResumePosition(snapshot, 120)).toBe(119.75);
    expect(resolveFallbackResumePosition(snapshot, 0)).toBe(133.5);
  });
});
