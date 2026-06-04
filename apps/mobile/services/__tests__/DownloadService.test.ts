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
  beforeEach(() => {
    streamEngineManager.bridgeAvailable = false;
    streamEngineManager.bridgeStatus = "unreachable";
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

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: false,
      offlinePlayable: false,
    });

    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";

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
    expect(mapDesktopDownloadStatus("Completed")).toBe("Completed");
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
      error: "Downloaded file could not be verified on this device.",
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
});
