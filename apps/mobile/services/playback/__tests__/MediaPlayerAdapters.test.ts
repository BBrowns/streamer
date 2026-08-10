import fs from "node:fs";
import {
  ElectronVideoAdapter,
  NativeExpoVideoAdapter,
  WebVideoAdapter,
  createMediaPlayerAdapter,
} from "../mediaPlayerAdapters";

type PlayerEventListener = (payload?: Record<string, unknown>) => void;

function createPlayer() {
  const listeners = new Map<string, Set<PlayerEventListener>>();
  const player = {
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
    availableAudioTracks: [
      { id: "audio-en", language: "eng", label: "English" },
    ],
    availableSubtitleTracks: [
      { id: "subtitle-nl", language: "nld", label: "Nederlands" },
    ],
    audioTrack: null,
    subtitleTrack: null,
    play: jest.fn(),
    pause: jest.fn(),
    seekBy: jest.fn(),
    replaceAsync: jest.fn().mockResolvedValue(undefined),
    generateThumbnailsAsync: jest.fn(async () => [{ requestedTime: 20 }]),
    addListener: jest.fn((event: string, listener: PlayerEventListener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return { remove: jest.fn(() => eventListeners.delete(listener)) };
    }),
  };

  return {
    player,
    emit(event: string, payload?: Record<string, unknown>) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    listenerCount() {
      return [...listeners.values()].reduce(
        (count, eventListeners) => count + eventListeners.size,
        0,
      );
    },
  };
}

describe("media player adapter boundary", () => {
  it("keeps the application port free from Expo imports", () => {
    const source = fs.readFileSync(
      require.resolve("../MediaPlayerAdapter"),
      "utf8",
    );

    expect(source).not.toContain("expo-video");
    expect(source).not.toContain("mediaPlayerAdapters");
  });

  it("creates explicit native, web, and Electron targets", () => {
    const { player } = createPlayer();

    expect(
      createMediaPlayerAdapter({ player, runtime: "ios" }).getCapabilities()
        .target,
    ).toBe("native-ios");
    expect(
      createMediaPlayerAdapter({
        player,
        runtime: "android",
      }).getCapabilities().target,
    ).toBe("native-android");
    expect(
      createMediaPlayerAdapter({ player, runtime: "web" }).getCapabilities()
        .target,
    ).toBe("web");
    expect(
      createMediaPlayerAdapter({
        player,
        runtime: "electron",
      }).getCapabilities().target,
    ).toBe("electron");
  });

  it("keeps native scrubbing, thumbnails, fullscreen, and PiP behind one adapter", async () => {
    const { player } = createPlayer();
    const surface = {
      enterFullscreen: jest.fn().mockResolvedValue(undefined),
      startPictureInPicture: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new NativeExpoVideoAdapter(player, "ios", {
      resolveSurface: () => surface,
      pictureInPictureSupported: true,
    });

    expect(adapter.getCapabilities()).toMatchObject({
      target: "native-ios",
      playerVolume: false,
      fullscreen: true,
      pictureInPicture: true,
      nativeThumbnails: true,
    });

    adapter.beginScrubbing();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.scrubbingModeOptions).toEqual({
      scrubbingModeEnabled: true,
      increaseCodecOperatingRate: true,
    });
    await expect(adapter.generateThumbnails([20])).resolves.toEqual([
      { requestedTime: 20 },
    ]);
    await expect(adapter.requestFullscreen()).resolves.toBe(true);
    await expect(adapter.requestPictureInPicture()).resolves.toBe(true);
    expect(surface.enterFullscreen).toHaveBeenCalledTimes(1);
    expect(surface.startPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it("uses only the web surface supplied by the composition root", async () => {
    const { player } = createPlayer();
    const video = {
      readyState: 2,
      requestFullscreen: jest.fn().mockResolvedValue(undefined),
      requestPictureInPicture: jest.fn().mockResolvedValue(undefined),
    };
    const document = {
      fullscreenElement: null,
      pictureInPictureEnabled: true,
      exitFullscreen: jest.fn().mockResolvedValue(undefined),
    };
    const resolveVideoElement = jest.fn(() => video);
    const adapter = new WebVideoAdapter(player, {
      resolveVideoElement,
      document,
    });

    expect(adapter.getCapabilities()).toMatchObject({
      target: "web",
      playerVolume: true,
      audioTracks: false,
      embeddedSubtitles: false,
      fullscreen: true,
      pictureInPicture: true,
      nativeThumbnails: false,
    });
    await expect(adapter.requestFullscreen()).resolves.toBe(true);
    await expect(adapter.requestPictureInPicture()).resolves.toBe(true);
    expect(resolveVideoElement).toHaveBeenCalled();
    expect(video.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it("keeps Electron explicit while delegating its current renderer behavior to web", () => {
    const { player } = createPlayer();
    const adapter = new ElectronVideoAdapter(player);

    expect(adapter).toBeInstanceOf(WebVideoAdapter);
    expect(adapter.getCapabilities()).toMatchObject({
      target: "electron",
      playerVolume: true,
      audioTracks: false,
      embeddedSubtitles: false,
    });
  });

  it("normalizes media events, redacts source-bearing errors, and removes listeners", () => {
    const { player, emit, listenerCount } = createPlayer();
    const adapter = new WebVideoAdapter(player);
    const events: unknown[] = [];
    const unsubscribe = adapter.subscribe((event) => events.push(event));

    expect(listenerCount()).toBeGreaterThan(0);
    emit("statusChange", {
      status: "error",
      error: {
        message:
          "Could not load https://media.example/private?token=secret magnet:?xt=urn:btih:secret content://private/video Bearer bridge-secret /Users/alice/private.mp4",
      },
    });
    emit("timeUpdate", { currentTime: 25 });
    emit("availableAudioTracksChange");
    emit("playToEnd");

    expect(events).toEqual([
      {
        type: "status_changed",
        status: "error",
        error: {
          code: "MEDIA_ERROR",
          message:
            "Could not load [url] [magnet] [redacted media] Bearer [redacted] /Users/[redacted]/private.mp4",
        },
      },
      {
        type: "time_updated",
        currentTime: 25,
        bufferedPosition: 48,
      },
      { type: "tracks_changed" },
      { type: "completed" },
    ]);

    unsubscribe();
    unsubscribe();
    expect(listenerCount()).toBe(0);
  });

  it("normalizes tracks and bounds rate, mute, and volume mutations", () => {
    const { player } = createPlayer();
    const webAdapter = new WebVideoAdapter(player);
    const nativeAdapter = new NativeExpoVideoAdapter(player, "ios");

    expect(webAdapter.getAudioTracks()).toEqual([]);
    expect(webAdapter.getSubtitleTracks()).toEqual([]);
    expect(webAdapter.selectAudioTrack("audio-en")).toBe(false);
    expect(nativeAdapter.getAudioTracks()).toEqual([
      expect.objectContaining({
        id: "audio-en",
        kind: "audio",
        language: "eng",
        label: "English",
      }),
    ]);
    expect(nativeAdapter.selectAudioTrack("audio-en")).toBe(true);
    expect(player.audioTrack).toBe(player.availableAudioTracks[0]);
    expect(webAdapter.setPlaybackRate(1.5)).toBe(true);
    expect(webAdapter.setPlaybackRate(Number.NaN)).toBe(false);
    expect(webAdapter.setMuted(true)).toBe(true);
    expect(webAdapter.setVolume(2)).toBe(true);
    expect(nativeAdapter.setMuted(false)).toBe(false);
    expect(nativeAdapter.setVolume(0.5)).toBe(false);
    expect(player.playbackRate).toBe(1.5);
    expect(player.muted).toBe(true);
    expect(player.volume).toBe(1);
  });

  it("keeps duplicate id-less native tracks unique and selects the active occurrence", () => {
    const { player } = createPlayer();
    const first = {
      id: undefined,
      language: "eng",
      label: "English",
    };
    const second = {
      id: undefined,
      language: "eng",
      label: "English",
    };
    (player as any).availableAudioTracks = [first, second];
    (player as any).audioTrack = second;
    const adapter = new NativeExpoVideoAdapter(player, "ios");

    const tracks = adapter.getAudioTracks();
    expect(tracks.map((track) => track.id)).toEqual([
      "eng:English:0",
      "eng:English:1",
    ]);
    expect(tracks.map((track) => track.active)).toEqual([false, true]);
    expect(adapter.selectAudioTrack(tracks[1].id)).toBe(true);
    expect(player.audioTrack).toBe(second);
  });
});
