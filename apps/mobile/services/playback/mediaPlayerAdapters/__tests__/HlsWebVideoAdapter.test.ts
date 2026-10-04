import {
  classifyHlsFatalError,
  createHlsPlayerFacade,
  getHlsFragmentLoaderConfig,
  getPublishedHlsWindow,
  HlsWebVideoAdapter,
  isHlsMediaRecoveryExhausted,
  shouldCountHlsMediaReset,
} from "../HlsWebVideoAdapter";

describe("HLS fatal error classification", () => {
  it("treats a MediaSource reset as recoverable", () => {
    expect(
      classifyHlsFatalError({
        type: "mediaError",
        details: "mediaSourceRequiresReset",
      }),
    ).toBe("recover");
  });

  it("keeps manifest failures terminal for the current source", () => {
    expect(
      classifyHlsFatalError({
        type: "networkError",
        details: "manifestLoadError",
      }),
    ).toBe("fail");
  });

  it("allows one media reset recovery and then fails the source", () => {
    expect(isHlsMediaRecoveryExhausted(1)).toBe(false);
    expect(isHlsMediaRecoveryExhausted(2)).toBe(true);
  });

  it("coalesces duplicate reset callbacks from one HLS recovery cycle", () => {
    expect(shouldCountHlsMediaReset(0, 1_000)).toBe(true);
    expect(shouldCountHlsMediaReset(1_000, 1_100)).toBe(false);
    expect(shouldCountHlsMediaReset(1_000, 1_250)).toBe(true);
  });
});

describe("HLS fragment loading configuration", () => {
  it("gives bounded random-access chunk rendering time to finish", () => {
    expect(getHlsFragmentLoaderConfig()).toEqual({
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 45_000,
          maxLoadTimeMs: 45_000,
          timeoutRetry: {
            maxNumRetry: 1,
            retryDelayMs: 1_000,
            maxRetryDelayMs: 1_000,
          },
          errorRetry: {
            maxNumRetry: 1,
            retryDelayMs: 1_000,
            maxRetryDelayMs: 1_000,
          },
        },
      },
    });
  });
});

function createFakeVideo(seekableRange = { start: 0, end: 4 }) {
  const listeners = new Map<string, Set<() => void>>();
  const video = {
    paused: true,
    ended: false,
    currentTime: 0,
    duration: 8,
    volume: 1,
    muted: false,
    playbackRate: 1,
    buffered: {
      length: 1,
      start: () => seekableRange.start,
      end: () => seekableRange.end,
    },
    seekable: {
      length: 1,
      start: () => seekableRange.start,
      end: () => seekableRange.end,
    },
    addEventListener: (event: string, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    removeEventListener: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
    dispatch: (event: string) => {
      for (const listener of listeners.get(event) ?? []) listener();
    },
    removeAttribute: jest.fn(),
    load: jest.fn(),
    play: jest.fn(async () => undefined),
    pause: jest.fn(),
    canPlayType: jest.fn(() => ""),
  } as unknown as HTMLVideoElement & { dispatch: (event: string) => void };
  return video;
}

describe("HlsWebVideoAdapter", () => {
  it("derives the seek window from the fragments still published by HLS", () => {
    expect(
      getPublishedHlsWindow([
        { start: 120, duration: 2 },
        { start: 122, duration: 2 },
        { start: 124, duration: 2 },
      ]),
    ).toEqual({ start: 120, end: 126 });
  });

  it("exposes HLS media events and controls through the existing player facade", () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo({ start: 0, end: 8 });
    adapter.mount(video);
    const player = createHlsPlayerFacade(adapter);
    const events: string[] = [];

    player.addListener?.("statusChange", (payload) => {
      events.push(String(payload?.status));
    });
    player.addListener?.("playingChange", (payload) => {
      events.push(payload?.isPlaying ? "playing" : "paused");
    });

    video.dispatch("loadedmetadata");
    video.paused = false;
    video.dispatch("playing");
    player.currentTime = 3;

    expect(events).toEqual(["readyToPlay", "playing"]);
    expect(player.status).toBe("readyToPlay");
    expect(player.playing).toBe(true);
    expect(player.duration).toBe(8);
    expect(player.currentTime).toBe(3);
    expect(player.bufferedPosition).toBe(8);
    expect(player.play).toBeDefined();
    expect(player.pause).toBeDefined();

    adapter.unmount();
  });

  it("rejects a seek outside the currently published HLS window", async () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo();
    const rejected = jest.fn();
    adapter.subscribe((event) => {
      if (event.type === "seek_rejected") rejected(event);
    });
    adapter.mount(video);

    await expect(adapter.commitSeek(6)).rejects.toThrow(
      "outside the seekable media range",
    );

    expect(video.currentTime).toBe(0);
    expect(rejected).toHaveBeenCalledWith({
      type: "seek_rejected",
      position: 6,
      start: 0,
      end: 4,
    });
    adapter.unmount();
  });

  it("clears the old source and invalidates pending HLS work", () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo();
    adapter.mount(video);

    adapter.clearSource();

    expect(adapter.snapshot()).toMatchObject({ status: "idle" });
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.load).toHaveBeenCalled();
    adapter.unmount();
  });

  it("automatically resumes after a buffer-induced pause while playback is intended", () => {
    jest.useFakeTimers();
    try {
      const adapter = new HlsWebVideoAdapter();
      const video = createFakeVideo();
      video.play = jest.fn(async () => {
        video.paused = false;
      });
      adapter.mount(video);

      adapter.play();
      expect(video.play).toHaveBeenCalledTimes(1);

      video.paused = true;
      video.dispatch("waiting");
      video.dispatch("pause");
      jest.advanceTimersByTime(500);

      expect(video.play).toHaveBeenCalledTimes(2);
      adapter.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not auto-resume after an explicit pause", () => {
    jest.useFakeTimers();
    try {
      const adapter = new HlsWebVideoAdapter();
      const video = createFakeVideo();
      video.play = jest.fn(async () => {
        video.paused = false;
      });
      adapter.mount(video);

      adapter.play();
      adapter.pause();
      video.paused = true;
      video.dispatch("pause");
      jest.advanceTimersByTime(2_000);

      expect(video.play).toHaveBeenCalledTimes(1);
      adapter.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps HLS time and range coordinates relative to the title, not the window", async () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo({ start: 20, end: 24 });
    video.currentTime = 22;
    adapter.mount(video);
    video.dispatch("loadedmetadata");

    expect(adapter.snapshot()).toEqual(
      expect.objectContaining({
        currentTime: 22,
        duration: 24,
        seekableRanges: [{ start: 20, end: 24 }],
        bufferedRanges: [{ start: 20, end: 24 }],
        bufferedPosition: 24,
        canSeek: true,
      }),
    );

    await expect(adapter.commitSeek(23)).resolves.toBe(23);
    expect(video.currentTime).toBe(23);
    adapter.unmount();
  });

  it("translates nonzero source timestamps onto the title timeline", async () => {
    const adapter = new HlsWebVideoAdapter({ timeOriginSeconds: 20 });
    const video = createFakeVideo({ start: 20, end: 24 });
    video.duration = 28;
    video.currentTime = 22;
    adapter.mount(video);
    video.dispatch("loadedmetadata");

    expect(adapter.snapshot()).toEqual(
      expect.objectContaining({
        currentTime: 2,
        timeOriginSeconds: 20,
        duration: 8,
        bufferedPosition: 4,
        bufferedRanges: [{ start: 0, end: 4 }],
        seekableRanges: [{ start: 0, end: 4 }],
      }),
    );
    await expect(adapter.commitSeek(3)).resolves.toBe(3);
    expect(video.currentTime).toBe(23);
    adapter.unmount();
  });

  it("keeps the media position unchanged while previewing a scrub", () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo({ start: 20, end: 24 });
    video.currentTime = 22;
    adapter.mount(video);

    adapter.previewSeek(23);

    expect(video.currentTime).toBe(22);
    adapter.unmount();
  });
});
