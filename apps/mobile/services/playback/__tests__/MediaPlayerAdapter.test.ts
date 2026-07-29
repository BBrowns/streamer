import { ExpoMediaPlayerAdapter } from "../MediaPlayerAdapter";

function createPlayer() {
  return {
    status: "readyToPlay",
    currentTime: 24,
    duration: 120,
    bufferedPosition: 48,
    playing: true,
    muted: false,
    volume: 0.8,
    playbackRate: 1,
    seekTolerance: {},
    scrubbingModeOptions: {},
    availableAudioTracks: [],
    availableSubtitleTracks: [],
    audioTrack: null,
    subtitleTrack: null,
    play: jest.fn(),
    pause: jest.fn(),
    seekBy: jest.fn(),
    replaceAsync: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
}

describe("ExpoMediaPlayerAdapter", () => {
  it("returns a normalized runtime snapshot", () => {
    const player = createPlayer();
    const adapter = new ExpoMediaPlayerAdapter(player as any, "web");

    expect(adapter.snapshot()).toMatchObject({
      status: "ready",
      currentTime: 24,
      duration: 120,
      bufferedPosition: 48,
      playing: true,
      muted: false,
      volume: 0.8,
      playbackRate: 1,
      canSeek: true,
    });
  });

  it("enables bounded scrubbing optimizations only during a drag", () => {
    const player = createPlayer();
    const adapter = new ExpoMediaPlayerAdapter(player as any, "android");

    adapter.beginScrubbing();
    expect(player.scrubbingModeOptions).toEqual({
      scrubbingModeEnabled: true,
      increaseCodecOperatingRate: true,
    });
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 1,
      toleranceAfter: 1,
    });

    adapter.endScrubbing({ shouldResume: true });
    expect(player.scrubbingModeOptions).toEqual({
      scrubbingModeEnabled: false,
    });
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 0,
      toleranceAfter: 0,
    });
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("pauses iOS while scrubbing and preserves an intentional pause", () => {
    const player = createPlayer();
    player.playing = false;
    const adapter = new ExpoMediaPlayerAdapter(player as any, "ios");

    adapter.beginScrubbing();
    expect(player.pause).toHaveBeenCalledTimes(1);

    adapter.endScrubbing({ shouldResume: false });
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledTimes(2);
  });

  it("uses precise committed seeks after preview scrubbing", () => {
    const player = createPlayer();
    const adapter = new ExpoMediaPlayerAdapter(player as any, "ios");

    adapter.beginScrubbing();
    adapter.previewSeek(33.4);
    expect(player.currentTime).toBe(33.4);
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 1,
      toleranceAfter: 1,
    });

    adapter.commitSeek(35);
    expect(player.currentTime).toBe(35);
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 0,
      toleranceAfter: 0,
    });
  });
});
