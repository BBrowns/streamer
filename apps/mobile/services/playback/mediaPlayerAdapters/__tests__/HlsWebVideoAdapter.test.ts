import {
  createHlsPlayerFacade,
  getPublishedHlsWindow,
  HlsWebVideoAdapter,
} from "../HlsWebVideoAdapter";

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
      end: () => 4,
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
    expect(player.bufferedPosition).toBe(4);
    expect(player.play).toBeDefined();
    expect(player.pause).toBeDefined();

    adapter.unmount();
  });

  it("does not clamp a seek outside the currently published HLS window", () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo();
    const rejected = jest.fn();
    adapter.subscribe((event) => {
      if (event.type === "seek_rejected") rejected(event);
    });
    adapter.mount(video);

    adapter.commitSeek(6);

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

  it("exposes a zero-based timeline for a rolling HLS seek window", () => {
    const adapter = new HlsWebVideoAdapter();
    const video = createFakeVideo({ start: 20, end: 24 });
    video.currentTime = 22;
    adapter.mount(video);

    expect(adapter.snapshot()).toEqual(
      expect.objectContaining({
        currentTime: 2,
        duration: 4,
        bufferedPosition: 0,
        canSeek: true,
      }),
    );

    adapter.commitSeek(3);
    expect(video.currentTime).toBe(23);
    adapter.unmount();
  });
});
