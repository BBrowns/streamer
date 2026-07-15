import { Platform } from "react-native";
import {
  OFFLINE_MEDIA_PROBE_TIMEOUT_MS,
  probeLocalMedia,
  validateOfflineInspection,
} from "../offlineVerification";

jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(),
}));

describe("validateOfflineInspection", () => {
  it("rejects a missing managed file", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: false, isFile: false, sizeBytes: 0 },
        expectedMediaBytes: 20_000_000,
        contentType: "video/mp4",
      }),
    ).toMatchObject({ ok: false, reason: "missing" });
  });

  it("rejects a directory at the managed media path", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: false, sizeBytes: 20_000_000 },
        expectedMediaBytes: 20_000_000,
        contentType: "video/mp4",
      }),
    ).toMatchObject({ ok: false, reason: "not_file" });
  });

  it("rejects the observed 206 KB placeholder regression", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: true, sizeBytes: 206 * 1024 },
        expectedMediaBytes: 206 * 1024,
        contentType: "application/octet-stream",
      }),
    ).toMatchObject({ ok: false, reason: "too_small" });
  });

  it("rejects metadata responses and incomplete media", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: true, sizeBytes: 2_000_000 },
        contentType: "application/json; charset=utf-8",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_content_type" });
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: true, sizeBytes: 2_000_000 },
        expectedMediaBytes: 20_000_000,
      }),
    ).toMatchObject({ ok: false, reason: "size_mismatch" });
  });

  it("accepts a plausible complete media file for the playability probe", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: true, sizeBytes: 20_000_000 },
        expectedMediaBytes: 20_000_000,
        contentType: "video/mp4",
      }),
    ).toEqual({ ok: true, sizeBytes: 20_000_000 });
  });

  it("requires an exact match when a reliable expected media size exists", () => {
    expect(
      validateOfflineInspection({
        inspection: { exists: true, isFile: true, sizeBytes: 20_000_001 },
        expectedMediaBytes: 20_000_000,
        contentType: "video/mp4",
      }),
    ).toMatchObject({ ok: false, reason: "size_mismatch" });
  });
});

describe("probeLocalMedia", () => {
  const originalPlatform = Platform.OS;
  const originalDocument = (global as any).document;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    if (originalDocument === undefined) {
      delete (global as any).document;
    } else {
      (global as any).document = originalDocument;
    }
  });

  function mockNativePlayer() {
    const listeners = new Map<string, (event: any) => void>();
    const player = {
      status: "loading",
      duration: 0,
      addListener: jest.fn((event: string, listener: (value: any) => void) => {
        listeners.set(event, listener);
        return { remove: jest.fn() };
      }),
      release: jest.fn(),
    };
    const { createVideoPlayer } = require("expo-video") as {
      createVideoPlayer: jest.Mock;
    };
    createVideoPlayer.mockReturnValue(player);
    return { listeners, player };
  }

  it("accepts native media when duration arrives before readyToPlay", async () => {
    const { listeners, player } = mockNativePlayer();
    const result = probeLocalMedia("file:///downloads/movie.mp4");

    listeners.get("sourceLoad")?.({ duration: 7_200 });
    listeners.get("statusChange")?.({ status: "readyToPlay" });

    await expect(result).resolves.toBe(true);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("accepts native media when readyToPlay arrives before duration", async () => {
    const { listeners, player } = mockNativePlayer();
    const result = probeLocalMedia("file:///downloads/movie.mp4");

    listeners.get("statusChange")?.({ status: "readyToPlay" });
    listeners.get("sourceLoad")?.({ duration: 7_200 });

    await expect(result).resolves.toBe(true);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("does not accept source metadata without readyToPlay", async () => {
    const { listeners, player } = mockNativePlayer();
    const result = probeLocalMedia("file:///downloads/movie.mp4");

    listeners.get("sourceLoad")?.({ duration: 7_200 });
    jest.advanceTimersByTime(OFFLINE_MEDIA_PROBE_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("rejects a native decode error after metadata loads", async () => {
    const { listeners, player } = mockNativePlayer();
    const result = probeLocalMedia("file:///downloads/movie.mp4");

    listeners.get("sourceLoad")?.({ duration: 7_200 });
    listeners.get("statusChange")?.({ status: "error" });

    await expect(result).resolves.toBe(false);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("rejects a native media probe after the eight-second deadline", async () => {
    const { player } = mockNativePlayer();
    const result = probeLocalMedia("file:///downloads/movie.mp4");

    jest.advanceTimersByTime(OFFLINE_MEDIA_PROBE_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  function mockWebVideo() {
    const listeners = new Map<string, () => void>();
    const video = {
      preload: "",
      muted: false,
      style: {} as Record<string, string>,
      duration: Number.NaN,
      src: "",
      pause: jest.fn(),
      removeAttribute: jest.fn(),
      load: jest.fn(),
      remove: jest.fn(),
      addEventListener: jest.fn((event: string, listener: () => void) =>
        listeners.set(event, listener),
      ),
    };
    (global as any).document = {
      createElement: jest.fn(() => video),
      body: { appendChild: jest.fn() },
    };
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    return { listeners, video };
  }

  it("requires canplay in addition to web metadata and duration", async () => {
    const { listeners, video } = mockWebVideo();
    const result = probeLocalMedia("streamer:///downloads/movie.mp4");

    video.duration = 7_200;
    listeners.get("loadedmetadata")?.();
    jest.advanceTimersByTime(OFFLINE_MEDIA_PROBE_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
  });

  it("accepts web media after canplay with a valid duration", async () => {
    const { listeners, video } = mockWebVideo();
    const result = probeLocalMedia("streamer:///downloads/movie.mp4");

    video.duration = 7_200;
    listeners.get("loadedmetadata")?.();
    listeners.get("canplay")?.();

    await expect(result).resolves.toBe(true);
  });
});
