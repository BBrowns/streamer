import type { Stream } from "@streamer/shared";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { useDownloadStore } from "../../stores/downloadStore";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../test-utils/playbackPlan";
import {
  DownloadService,
  getDownloadEligibility,
  mapDesktopDownloadStatus,
  toSafeDownloadErrorMessage,
} from "../DownloadService";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";

jest.mock("../api", () => ({
  api: {
    post: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function installUuidMock() {
  let value = 1;
  jest
    .mocked(Crypto.randomUUID)
    .mockImplementation(
      () =>
        `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
    );
}

function createDownloadSessionContext() {
  const session = usePlaybackSessionStore.getState().createSession({
    plan: makePlaybackPlan({
      action: "download",
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: makePlannedMediaCandidate({
          id: "00000000-0000-4000-8000-000000000101",
          kind: "direct",
          stream: { url: "https://cdn.example.test/movie.mp4" },
          actionEligibility: { action: "download", eligible: true },
        }),
      },
    }),
    content: { type: "movie", id: "tt123" },
    deviceProfile: {
      platform: "electron",
      maxQuality: "1080p",
      network: "local",
      supports: {
        h264: true,
        h265: true,
        av1: false,
        mp4: true,
        mkv: true,
        hls: true,
        dolbyVision: false,
        aac: true,
        ac3: true,
        eac3: true,
      },
    },
  });

  return {
    sessionId: session.id,
    candidateId: session.selectedCandidateId!,
    attemptId: "00000000-0000-4000-8000-000000000201",
  };
}

describe("getDownloadEligibility", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.restoreAllMocks();
    setPlatform("web");
    streamEngineManager.bridgeAvailable = false;
    streamEngineManager.bridgeStatus = "unreachable";
    streamEngineManager.bridgeUrl = "http://localhost:11470";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setPlatform(originalPlatform);
  });

  it("does not mark HLS streams offline-playable", () => {
    const stream: Stream = { url: "https://example.test/live/master.m3u8" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "unsupported",
      canDownload: false,
      offlinePlayable: false,
    });
  });

  it("marks direct file streams offline-playable", () => {
    const stream: Stream = { url: "https://example.test/movie.mp4" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "direct-file",
      canDownload: true,
      offlinePlayable: true,
    });
  });

  it("requires the desktop bridge for torrent downloads", () => {
    const stream: Stream = { infoHash: "abc123" };
    const getBridgeUrl = jest.spyOn(streamEngineManager, "getBridgeUrl");

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: false,
      offlinePlayable: false,
    });
    expect(getBridgeUrl).not.toHaveBeenCalled();

    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";
    getBridgeUrl.mockReturnValue("http://localhost:11470");

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: true,
      offlinePlayable: true,
    });
  });

  it("blocks native torrent downloads when the bridge URL is device-local loopback", () => {
    const stream: Stream = { infoHash: "abc123" };
    setPlatform("ios");
    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";
    jest
      .spyOn(streamEngineManager, "getBridgeUrl")
      .mockReturnValue("http://localhost:11470");

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: false,
      offlinePlayable: false,
      reason:
        "This device cannot reach a desktop bridge through localhost. Use the desktop LAN URL.",
    });
  });

  it("allows native torrent downloads when the bridge URL is LAN-reachable", () => {
    const stream: Stream = { infoHash: "abc123" };
    setPlatform("ios");
    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";
    jest
      .spyOn(streamEngineManager, "getBridgeUrl")
      .mockReturnValue("http://192.168.1.25:11470");

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: true,
      offlinePlayable: true,
    });
  });

  it("treats browser external sources as non-offline downloads", () => {
    const stream: Stream = { externalUrl: "https://example.test/file.mp4" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "browser-external",
      offlinePlayable: false,
    });
  });

  it("maps desktop download job statuses to mobile queue statuses", () => {
    expect(mapDesktopDownloadStatus("Pending")).toBe("Preparing");
    expect(mapDesktopDownloadStatus("Downloading")).toBe("Downloading");
    expect(mapDesktopDownloadStatus("Paused")).toBe("Paused");
    expect(mapDesktopDownloadStatus("Completed")).toBe("Verifying");
    expect(mapDesktopDownloadStatus("Error")).toBe("Error");
    expect(mapDesktopDownloadStatus("Canceled")).toBe("Error");
  });
});

describe("DownloadService session completion", () => {
  const originalPlatform = Platform.OS;
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    installUuidMock();
    jest.clearAllMocks();
    installUuidMock();
    useDownloadStore.getState().clearAll();
    usePlaybackSessionStore.getState().clearAllSessions();
    setPlatform("web");
    delete window.desktopBridge;
  });

  afterEach(() => {
    useDownloadStore.getState().clearAll();
    usePlaybackSessionStore.getState().clearAllSessions();
    setPlatform(originalPlatform);
    window.desktopBridge = originalDesktopBridge;
  });

  it("marks an Electron download complete only after its local URI is verified", async () => {
    const playbackSession = createDownloadSessionContext();
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 1000,
        totalBytesExpectedToWrite: 1000,
        localUri: "streamer:///downloads/source_1.mp4",
      }),
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        sourceId: "source-1",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
        playbackSession,
      },
    );
    await flushPromises();

    expect(window.desktopBridge!.checkFile).toHaveBeenCalledWith(
      "streamer:///downloads/source_1.mp4",
    );
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Completed",
      localUri: "streamer:///downloads/source_1.mp4",
      playbackSession,
      offlineVerifiedAt: expect.any(String),
    });
    expect(
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId],
    ).toMatchObject({
      status: "completed",
      eventLog: expect.arrayContaining([
        expect.objectContaining({ type: "download_progress" }),
        expect.objectContaining({ type: "download_verified" }),
        expect.objectContaining({ type: "session_completed" }),
      ]),
    });
  });

  it("does not fake offline completion when Electron cannot verify the file", async () => {
    const playbackSession = createDownloadSessionContext();
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 1000,
        totalBytesExpectedToWrite: 1000,
        localUri: "streamer:///downloads/source_1.mp4",
      }),
      checkFile: jest.fn().mockResolvedValue(false),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        sourceId: "source-1",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
        playbackSession,
      },
    );
    await flushPromises();

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Downloaded file could not be verified on this device.",
    });
    expect(
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId],
    ).toMatchObject({
      status: "failed",
      terminalError: { code: "SOURCE_UNAVAILABLE" },
    });
  });

  it("removes browser fallback tasks instead of marking them offline-playable", async () => {
    const playbackSession = createDownloadSessionContext();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const originalDocument = global.document;
    global.document = {
      createElement: jest.fn(() => ({ click })),
      body: { appendChild, removeChild },
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        sourceId: "source-1",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
        playbackSession,
      },
    );
    global.document = originalDocument;

    expect(click).toHaveBeenCalled();
    expect(useDownloadStore.getState().tasks["source-1"]).toBeUndefined();
    expect(
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId],
    ).toMatchObject({
      status: "failed",
      terminalError: { code: "SOURCE_UNAVAILABLE" },
    });
  });

  it("rechecks persisted completed files during initialization", async () => {
    window.desktopBridge = {
      checkFile: jest.fn().mockResolvedValue(false),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore
      .getState()
      .setStatus("source-1", "Completed", "streamer:///missing/movie.mp4");
    const service = new DownloadService();

    await service.initialize();

    expect(window.desktopBridge!.checkFile).toHaveBeenCalledWith(
      "streamer:///missing/movie.mp4",
    );
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Downloaded file could not be found.",
    });
  });

  it("pauses an interrupted desktop download when the managed bridge job is gone", async () => {
    window.desktopBridge = {
      getDownloadJob: jest.fn().mockResolvedValue(null),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore.getState().setStatus("source-1", "Downloading");
    const service = new DownloadService();

    await service.initialize();

    expect(window.desktopBridge!.getDownloadJob).toHaveBeenCalledWith(
      "source-1",
    );
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Paused",
    });
  });

  it("does not resurrect a failed download verification during initialization", async () => {
    window.desktopBridge = {
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore
      .getState()
      .setStatus("source-1", "Error", undefined, "Verification failed.");
    const service = new DownloadService();

    await service.initialize();

    expect(window.desktopBridge!.checkFile).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Verification failed.",
    });
  });

  it("cancels the download session when the queue item is removed", async () => {
    const playbackSession = createDownloadSessionContext();
    useDownloadStore.getState().addTask(
      "source-1",
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        sourceId: "source-1",
        downloadUrl: "https://cdn.example.test/movie.mp4",
      },
      playbackSession,
    );
    const service = new DownloadService();

    await service.deleteDownload("source-1");

    expect(useDownloadStore.getState().tasks["source-1"]).toBeUndefined();
    expect(
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId],
    ).toMatchObject({
      status: "cancelled",
    });
  });

  it("marks a persisted completed file verified during initialization", async () => {
    window.desktopBridge = {
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore
      .getState()
      .setStatus("source-1", "Completed", "streamer:///downloads/movie.mp4");
    const service = new DownloadService();

    await service.initialize();

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Completed",
      localUri: "streamer:///downloads/movie.mp4",
      offlineVerifiedAt: expect.any(String),
    });
    expect(useDownloadStore.getState().isDownloaded("source-1")).toBe(true);
  });

  it("restarts a missing desktop job from persisted queue metadata", async () => {
    window.desktopBridge = {
      resumeDownloadJob: jest.fn().mockResolvedValue(null),
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Downloading",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 250,
        totalBytesExpectedToWrite: 1000,
      }),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore.getState().setStatus("source-1", "Paused");
    const service = new DownloadService();

    await expect(service.resumeDownload("source-1")).resolves.toEqual({
      ok: true,
    });

    expect(window.desktopBridge!.startDownloadJob).toHaveBeenCalledWith(
      "source-1",
      "https://cdn.example.test/movie.mp4",
      "source_1.mp4",
    );
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Downloading",
      progress: 0.25,
    });
  });

  it("reports an immediate desktop resume error instead of returning success", async () => {
    window.desktopBridge = {
      resumeDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Error",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 250,
        totalBytesExpectedToWrite: 1000,
        error: "Request failed for https://signed.example.test/movie.mp4",
      }),
      startDownloadJob: jest.fn(),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore.getState().setStatus("source-1", "Paused");
    const service = new DownloadService();

    await expect(service.resumeDownload("source-1")).resolves.toEqual({
      ok: false,
      error: "Request failed for [source]",
    });

    expect(window.desktopBridge!.startDownloadJob).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Request failed for [source]",
    });
  });

  it("keeps a desktop task recoverable when its active job is missing", async () => {
    window.desktopBridge = {
      pauseDownloadJob: jest.fn().mockResolvedValue(null),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore.getState().setStatus("source-1", "Downloading");
    const service = new DownloadService();

    await expect(service.pauseDownload("source-1")).resolves.toEqual({
      ok: true,
    });

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Paused",
    });
  });

  it("keeps failed deletions visible with a safe retryable error", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    window.desktopBridge = {
      cancelDownloadJob: jest.fn().mockResolvedValue(null),
      deleteFile: jest
        .fn()
        .mockRejectedValue(
          new Error(
            "Could not delete https://signed.example.test/movie.mp4?token=secret",
          ),
        ),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    useDownloadStore.getState().addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
      downloadUrl: "https://cdn.example.test/movie.mp4",
    });
    useDownloadStore
      .getState()
      .markVerified("source-1", "streamer:///downloads/movie.mp4");
    const service = new DownloadService();

    await expect(service.deleteDownload("source-1")).resolves.toMatchObject({
      ok: false,
    });

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Could not delete [source]",
    });
    expect(
      JSON.stringify(useDownloadStore.getState().tasks["source-1"]),
    ).not.toContain("signed.example.test");
  });

  it("sanitizes source URLs before download errors are persisted", () => {
    expect(
      toSafeDownloadErrorMessage(
        "Request failed for https://signed.example.test/movie.mp4?token=secret",
      ),
    ).toBe("Request failed for [source]");
  });
});
