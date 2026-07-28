import {
  PlaybackProgressClock,
  parseRuntimeSeconds,
  resolveProgressDuration,
} from "../PlaybackProgressClock";

describe("PlaybackProgressClock", () => {
  it("rejects transient source-replacement resets and unexplained jumps", () => {
    const clock = new PlaybackProgressClock();
    clock.reset(120, 1_000);
    clock.beginSourceReplacement();
    expect(clock.acceptTimeUpdate(0, 2_000)).toBe(false);
    clock.completeSourceReplacement(120, 3_000);
    expect(clock.acceptTimeUpdate(121, 4_000)).toBe(true);
    expect(clock.acceptTimeUpdate(1_200, 5_000)).toBe(false);
    expect(clock.snapshot(3_600, "media").currentTime).toBe(121);
  });

  it("accepts intentional forward and backward seeks", () => {
    const clock = new PlaybackProgressClock();
    clock.reset(120, 1_000);
    clock.recordExplicitSeek(1_200, 2_000);
    expect(clock.acceptTimeUpdate(1_201, 2_500)).toBe(true);
    clock.recordExplicitSeek(60, 3_000);
    expect(clock.acceptTimeUpdate(61, 3_500)).toBe(true);
  });

  it("never trusts the growing duration of a progressive remux", () => {
    expect(
      resolveProgressDuration({
        observedDuration: 300,
        metadataRuntime: "60 min",
        isProgressiveRemux: true,
        hasSeekableHandoff: false,
      }),
    ).toEqual({ duration: 3_600, durationSource: "metadata" });
    expect(
      resolveProgressDuration({
        observedDuration: 300,
        isProgressiveRemux: true,
        hasSeekableHandoff: false,
      }),
    ).toEqual({ duration: 0, durationSource: "unknown" });
  });

  it("uses media duration after the seekable handoff", () => {
    expect(
      resolveProgressDuration({
        observedDuration: 3_550,
        metadataRuntime: "60 min",
        isProgressiveRemux: true,
        hasSeekableHandoff: true,
      }),
    ).toEqual({ duration: 3_550, durationSource: "media" });
  });
});

describe("parseRuntimeSeconds", () => {
  it.each([
    ["58 min", 3_480],
    ["1h 45min", 6_300],
    ["109", 6_540],
    [undefined, 0],
  ])("parses %s", (runtime, expected) => {
    expect(parseRuntimeSeconds(runtime)).toBe(expected);
  });
});
