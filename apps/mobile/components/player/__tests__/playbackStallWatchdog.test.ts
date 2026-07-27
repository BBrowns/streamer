import {
  PLAYBACK_STALL_TIMEOUT_MS,
  hasPlaybackProgressed,
  shouldAdvanceAfterPlaybackStall,
} from "../playbackStallWatchdog";

describe("playbackStallWatchdog", () => {
  it("recognizes playhead or buffered-edge progress", () => {
    expect(
      hasPlaybackProgressed(
        { currentTime: 10, bufferedPosition: 12 },
        { currentTime: 10.4, bufferedPosition: 12 },
      ),
    ).toBe(true);
    expect(
      hasPlaybackProgressed(
        { currentTime: 10, bufferedPosition: 12 },
        { currentTime: 10.1, bufferedPosition: 12.5 },
      ),
    ).toBe(true);
    expect(
      hasPlaybackProgressed(
        { currentTime: 10, bufferedPosition: 12 },
        { currentTime: 10.01, bufferedPosition: 12.01 },
      ),
    ).toBe(false);
  });

  it("only advances after a started, visible playback has made no progress for the bounded window", () => {
    const now = 100_000;
    const base = {
      now,
      lastProgressAt: now - PLAYBACK_STALL_TIMEOUT_MS,
      hasStarted: true,
      isPlaying: true,
      isVisible: true,
      isSeeking: false,
      isCasting: false,
      fallbackInFlight: false,
      fallbackAlreadyTriggered: false,
    };

    expect(shouldAdvanceAfterPlaybackStall(base)).toBe(true);
    expect(
      shouldAdvanceAfterPlaybackStall({
        ...base,
        lastProgressAt: now - PLAYBACK_STALL_TIMEOUT_MS + 1,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceAfterPlaybackStall({ ...base, hasStarted: false }),
    ).toBe(false);
  });

  it.each([
    ["paused", { isPlaying: false }],
    ["hidden", { isVisible: false }],
    ["user seeking", { isSeeking: true }],
    ["casting", { isCasting: true }],
    ["fallback already in flight", { fallbackInFlight: true }],
    ["fallback already triggered", { fallbackAlreadyTriggered: true }],
  ])("does not fail over while %s", (_label, guard) => {
    expect(
      shouldAdvanceAfterPlaybackStall({
        now: 100_000,
        lastProgressAt: 100_000 - PLAYBACK_STALL_TIMEOUT_MS,
        hasStarted: true,
        isPlaying: true,
        isVisible: true,
        isSeeking: false,
        isCasting: false,
        fallbackInFlight: false,
        fallbackAlreadyTriggered: false,
        ...guard,
      }),
    ).toBe(false);
  });
});
