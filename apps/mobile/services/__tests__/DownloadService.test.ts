import type { Stream } from "@streamer/shared";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { useDownloadStore } from "../../stores/downloadStore";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../test-utils/playbackPlan";
import {
  DownloadService,
  getReliableContentLength,
  getDownloadEligibility,
  mapDesktopDownloadStatus,
  toSafeDownloadErrorMessage,
} from "../DownloadService";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";

jest.mock("../offlineVerification", () => ({
  ...jest.requireActual("../offlineVerification"),
  probeLocalMedia: jest.fn().mockResolvedValue(true),
}));

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

  it("accepts only a positive transport Content-Length as exact size", () => {
    expect(getReliableContentLength({ "content-length": "2000000000" })).toBe(
      2_000_000_000,
    );
    expect(getReliableContentLength({ "Content-Length": "unknown" })).toBe(
      undefined,
    );
    expect(
      getReliableContentLength(
        {
          "content-length": "500000000",
          "content-range": "bytes 1500000000-1999999999/2000000000",
        },
        206,
      ),
    ).toBe(2_000_000_000);
    expect(
      getReliableContentLength({ "content-length": "500000000" }, 206),
    ).toBeUndefined();
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
        totalBytesWritten: 2 * 1024 ** 2,
        totalBytesExpectedToWrite: 2 * 1024 ** 2,
        localUri: "streamer:///downloads/source_1.mp4",
      }),
      inspectFile: jest.fn().mockResolvedValue({
        exists: true,
        isFile: true,
        sizeBytes: 2 * 1024 ** 2,
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

    expect(window.desktopBridge!.inspectFile).toHaveBeenCalledWith(
      "streamer:///downloads/source_1.mp4",
    );
    expect(window.desktopBridge!.checkFile).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Completed",
      localUri: "streamer:///downloads/source_1.mp4",
      playbackSession,
      offlineVerifiedAt: expect.any(String),
      verifiedFileSizeBytes: 2 * 1024 ** 2,
      verificationState: "verified",
      playableState: "playable",
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

  it("keeps a catalog size when an Electron job reports zero metadata bytes", async () => {
    const transportBytes = 2_000_000_000;
    const catalogEstimate = 2 * 1024 ** 3;
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-estimate",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_estimate.mp4",
        totalBytesWritten: transportBytes,
        totalBytesExpectedToWrite: transportBytes,
        metadataBytes: 0,
        contentType: "video/mp4",
        localUri: "streamer:///downloads/source_estimate.mp4",
      }),
      inspectFile: jest.fn().mockResolvedValue({
        exists: true,
        isFile: true,
        sizeBytes: transportBytes,
      }),
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt-estimate",
        title: "Estimated Movie",
        sourceId: "source-estimate",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
        metadataBytes: catalogEstimate,
      },
    );
    await flushPromises();

    expect(useDownloadStore.getState().tasks["source-estimate"]).toMatchObject({
      status: "Completed",
      metadataBytes: catalogEstimate,
      expectedMediaBytes: transportBytes,
      verifiedFileSizeBytes: transportBytes,
      verificationState: "verified",
      playableState: "playable",
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
      error: "Downloaded file could not be found.",
      failureReason: "missing_file",
    });
    expect(
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId],
    ).toMatchObject({
      status: "failed",
      terminalError: { code: "SOURCE_UNAVAILABLE" },
    });
  });

  it("does not trust downloaded bytes when a legacy Electron bridge only confirms existence", async () => {
    const fileSize = 2 * 1024 ** 2;
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-legacy-inspection",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_legacy_inspection.mp4",
        totalBytesWritten: fileSize,
        totalBytesExpectedToWrite: fileSize,
        metadataBytes: 0,
        localUri: "streamer:///downloads/source_legacy_inspection.mp4",
      }),
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt-legacy-inspection",
        title: "Legacy Inspection Movie",
        sourceId: "source-legacy-inspection",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
      },
    );
    await flushPromises();

    expect(window.desktopBridge!.checkFile).toHaveBeenCalledWith(
      "streamer:///downloads/source_legacy_inspection.mp4",
    );
    expect(
      useDownloadStore.getState().tasks["source-legacy-inspection"],
    ).toMatchObject({
      status: "Error",
      failureReason: "missing_file",
      downloadedBytes: fileSize,
      verifiedFileSizeBytes: undefined,
      verificationState: "failed",
      playableState: "unplayable",
      offlineVerifiedAt: undefined,
    });
    expect(
      useDownloadStore.getState().isDownloaded("source-legacy-inspection"),
    ).toBe(false);
  });

  it("does not trust downloaded bytes when native file inspection omits size", async () => {
    setPlatform("ios");
    const fileSize = 2 * 1024 ** 2;
    useDownloadStore.getState().addTask("source-native-inspection", {
      type: "movie",
      itemId: "tt-native-inspection",
      title: "Native Inspection Movie",
      sourceId: "source-native-inspection",
    });
    useDownloadStore
      .getState()
      .updateProgress("source-native-inspection", 1, fileSize, fileSize);
    useDownloadStore
      .getState()
      .setStatus(
        "source-native-inspection",
        "Completed",
        "file:///downloads/native-inspection.mp4",
      );
    const getInfo = jest.spyOn(FileSystem, "getInfoAsync").mockResolvedValue({
      exists: true,
      isDirectory: false,
      uri: "file:///downloads/native-inspection.mp4",
    } as any);
    const service = new DownloadService();

    await expect(service.verifyTask("source-native-inspection")).resolves.toBe(
      false,
    );

    expect(getInfo).toHaveBeenCalledWith(
      "file:///downloads/native-inspection.mp4",
    );
    expect(
      useDownloadStore.getState().tasks["source-native-inspection"],
    ).toMatchObject({
      status: "Error",
      failureReason: "invalid_media",
      downloadedBytes: fileSize,
      verifiedFileSizeBytes: 0,
      verificationState: "incomplete",
      playableState: "unplayable",
      offlineVerifiedAt: undefined,
    });
    getInfo.mockRestore();
  });

  it("rejects a 206 KB desktop response instead of exposing it offline", async () => {
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 206 * 1024,
        totalBytesExpectedToWrite: 206 * 1024,
        metadataBytes: 206 * 1024,
        contentType: "application/json",
        localUri: "streamer:///downloads/source_1.mp4",
      }),
      inspectFile: jest.fn().mockResolvedValue({
        exists: true,
        isFile: true,
        sizeBytes: 206 * 1024,
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
      },
    );
    await flushPromises();

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      failureReason: "invalid_media",
      verificationState: "incomplete",
      playableState: "unplayable",
      offlineVerifiedAt: undefined,
      verifiedFileSizeBytes: 206 * 1024,
    });
    expect(useDownloadStore.getState().isDownloaded("source-1")).toBe(false);
  });

  it("classifies a large metadata response as failed invalid media", async () => {
    const fileSize = 2 * 1024 ** 2;
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-metadata",
        status: "Completed",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_metadata.mp4",
        totalBytesWritten: fileSize,
        totalBytesExpectedToWrite: fileSize,
        contentType: "application/x-bittorrent",
        localUri: "streamer:///downloads/source_metadata.mp4",
      }),
      inspectFile: jest.fn().mockResolvedValue({
        exists: true,
        isFile: true,
        sizeBytes: fileSize,
      }),
      checkFile: jest.fn().mockResolvedValue(true),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;
    const service = new DownloadService();

    await service.startDownload(
      { url: "https://cdn.example.test/movie.mp4" },
      {
        type: "movie",
        itemId: "tt-metadata",
        title: "Metadata Movie",
        sourceId: "source-metadata",
      } as any,
      {
        resolvedUrl: "https://cdn.example.test/movie.mp4",
        eligibility: {
          mode: "direct-file",
          canDownload: true,
          offlinePlayable: true,
        },
      },
    );
    await flushPromises();

    expect(useDownloadStore.getState().tasks["source-metadata"]).toMatchObject({
      status: "Error",
      failureReason: "invalid_media",
      verificationState: "failed",
      playableState: "unplayable",
      offlineVerifiedAt: undefined,
    });
  });

  it("persists a typed storage recovery reason for a full desktop disk", async () => {
    window.desktopBridge = {
      startDownloadJob: jest.fn().mockResolvedValue({
        id: "source-1",
        status: "Error",
        downloadUrl: "https://cdn.example.test/movie.mp4",
        filename: "source_1.mp4",
        totalBytesWritten: 500,
        totalBytesExpectedToWrite: 1000,
        error: "write failed: ENOSPC",
      }),
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
      },
    );

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      failureReason: "storage_pressure",
      offlineVerifiedAt: undefined,
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
      inspectFile: jest.fn().mockResolvedValue({
        exists: true,
        isFile: true,
        sizeBytes: 2 * 1024 ** 2,
      }),
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
      verifiedFileSizeBytes: 2 * 1024 ** 2,
      verificationState: "verified",
      playableState: "playable",
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
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
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
      .markVerified(
        "source-1",
        "streamer:///downloads/movie.mp4",
        2 * 1024 ** 2,
      );
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
