import {
  NativeExpoVideoAdapter,
  WebVideoAdapter,
} from "../mediaPlayerAdapters";
import { SeekSupersededError } from "../ConfirmedMediaSeek";

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

describe("explicit media player adapters", () => {
  it("returns a normalized runtime snapshot", () => {
    const player = createPlayer();
    const adapter = new WebVideoAdapter(player as any);

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

  it("normalizes source time ranges and converts confirmed title seeks back to player time", async () => {
    const player = createPlayer();
    player.currentTime = 42;
    player.bufferedPosition = 50;
    (player as any).bufferedRanges = [{ start: 40, end: 50 }];
    (player as any).seekableTimeRanges = [{ start: 40, end: 160 }];
    const adapter = new WebVideoAdapter(player as any, {}, "web", 40);

    expect(adapter.snapshot()).toMatchObject({
      currentTime: 2,
      timeOriginSeconds: 40,
      duration: 120,
      bufferedPosition: 10,
      bufferedRanges: [{ start: 0, end: 10 }],
      seekableRanges: [{ start: 0, end: 120 }],
    });
    await expect(adapter.commitSeek(5)).resolves.toBe(5);
    expect(player.currentTime).toBe(45);
  });

  it("confirms a native seek at the title-relative duration without a buffer range", async () => {
    const player = createPlayer();
    player.duration = 120;
    const adapter = new NativeExpoVideoAdapter(
      player as any,
      "android",
      {},
      40,
    );

    expect(adapter.snapshot().duration).toBe(120);
    await expect(adapter.commitSeek(120, { timeoutMs: 30 })).resolves.toBe(120);
    expect(player.currentTime).toBe(160);
  });

  it("preserves an explicitly empty buffer range list instead of inferring from a stale edge", () => {
    const player = createPlayer();
    player.currentTime = 90;
    player.bufferedPosition = 105;
    (player as any).bufferedRanges = [];
    const adapter = new WebVideoAdapter(player as any);

    expect(adapter.snapshot()).toMatchObject({
      bufferedPosition: 105,
      bufferedRanges: [],
    });
  });

  it("uses the scalar buffer edge only when the runtime does not expose ranges", () => {
    const player = createPlayer();
    const adapter = new WebVideoAdapter(player as any);

    expect(adapter.snapshot().bufferedRanges).toEqual([{ start: 24, end: 48 }]);
  });

  it("preserves an explicitly empty seekable range list instead of inferring full-duration seeking", () => {
    const player = createPlayer();
    (player as any).seekableTimeRanges = [];
    const adapter = new WebVideoAdapter(player as any);

    expect(adapter.snapshot()).toMatchObject({
      duration: 120,
      seekableRanges: [],
      canSeek: false,
    });
  });

  it("enables bounded scrubbing optimizations only during a drag", () => {
    const player = createPlayer();
    const adapter = new NativeExpoVideoAdapter(player as any, "android");

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
    const adapter = new NativeExpoVideoAdapter(player as any, "ios");

    adapter.beginScrubbing();
    expect(player.pause).toHaveBeenCalledTimes(1);

    adapter.endScrubbing({ shouldResume: false });
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledTimes(2);
  });

  it("uses precise committed seeks after preview scrubbing", async () => {
    const player = createPlayer();
    const adapter = new NativeExpoVideoAdapter(player as any, "ios");

    adapter.beginScrubbing();
    adapter.previewSeek(33.4);
    expect(player.currentTime).toBe(24);
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 1,
      toleranceAfter: 1,
    });

    await expect(adapter.commitSeek(35)).resolves.toBe(35);
    expect(player.currentTime).toBe(35);
    expect(player.seekTolerance).toEqual({
      toleranceBefore: 0,
      toleranceAfter: 0,
    });
  });

  it("rejects a pending seek when a new source takes ownership", async () => {
    const player = createPlayer();
    const adapter = new WebVideoAdapter(player as any);
    const pendingSeek = adapter.commitSeek(90);

    await adapter.replaceSource("https://cdn.example.test/replacement.mp4");

    await expect(pendingSeek).rejects.toBeInstanceOf(SeekSupersededError);
  });
});
