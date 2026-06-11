import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { DownloadService } from "../DownloadService";
import { useDownloadStore } from "../../stores/downloadStore";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";

jest.mock("../streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    getPlaybackUri: jest.fn(),
  },
}));

jest.mock("expo-file-system", () => {
  const actual = jest.requireActual("expo-file-system");
  return {
    ...actual,
    getFreeDiskStorageAsync: jest.fn(),
    getTotalDiskCapacityAsync: jest.fn(),
    DownloadResumable: jest.fn().mockImplementation(() => ({
      resumeAsync: jest.fn(),
      savable: jest.fn().mockResolvedValue({ url: "http://mock.test" }),
    })),
  };
});

function setPlatform(os: "ios" | "android" | "web") {
  Platform.OS = os;
  // @ts-ignore
  Platform.select = (objs: any) => objs[os] || objs.default;
}

describe("DownloadService - Replan & Diagnostics", () => {
  const originalPlatform = Platform.OS;
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    useDownloadStore.getState().clearAll();
    delete window.desktopBridge;

    jest.mocked(FileSystem.getFreeDiskStorageAsync).mockResolvedValue(1000000);
    jest
      .mocked(FileSystem.getTotalDiskCapacityAsync)
      .mockResolvedValue(2000000);
  });

  afterEach(() => {
    setPlatform(originalPlatform as any);
    window.desktopBridge = originalDesktopBridge;
  });

  it("re-resolves URL on mobile when resume fails with 403 Forbidden", async () => {
    setPlatform("ios");
    const id = "task-1";
    const originalStream = { infoHash: "hash1" };
    const mediaInfo = {
      type: "movie",
      itemId: "tt1",
      title: "Test",
      sourceId: id,
    } as any;

    useDownloadStore
      .getState()
      .addTask(id, mediaInfo, undefined, originalStream);
    useDownloadStore.getState().setStatus(id, "Paused");

    const service = new DownloadService();
    // @ts-ignore - access private for mock
    service.downloadResumables[id] = {
      resumeAsync: jest.fn().mockRejectedValue(new Error("403 Forbidden")),
      savable: jest.fn().mockResolvedValue({ url: "http://expired.test" }),
    };

    jest
      .mocked(streamEngineManager.getPlaybackUri)
      .mockResolvedValue("http://fresh.test");

    const startDownloadSpy = jest
      .spyOn(service, "startDownload")
      .mockResolvedValue();

    const result = await service.resumeDownload(id);

    expect(result.ok).toBe(true);
    expect(streamEngineManager.getPlaybackUri).toHaveBeenCalledWith(
      originalStream,
    );
    expect(startDownloadSpy).toHaveBeenCalledWith(
      { ...originalStream, infoHash: undefined, url: "http://fresh.test" },
      mediaInfo,
      expect.objectContaining({ resolvedUrl: "http://fresh.test" }),
    );

    startDownloadSpy.mockRestore();
  });

  it("re-resolves URL on desktop when bridge report 403 error", async () => {
    setPlatform("web");
    const id = "task-1";
    const originalStream = { infoHash: "hash1" };
    const mediaInfo = {
      type: "movie",
      itemId: "tt1",
      title: "Test",
      sourceId: id,
      downloadUrl: "http://expired.test",
    } as any;

    useDownloadStore
      .getState()
      .addTask(id, mediaInfo, undefined, originalStream);
    useDownloadStore.getState().setStatus(id, "Paused");

    window.desktopBridge = {
      resumeDownloadJob: jest.fn().mockResolvedValue({
        id,
        status: "Error",
        error: "403 Forbidden",
        downloadUrl: "http://expired.test",
        filename: "test.mp4",
        totalBytesWritten: 0,
        totalBytesExpectedToWrite: 100,
      }),
      startDownloadJob: jest.fn().mockResolvedValue({
        id,
        status: "Downloading",
        downloadUrl: "http://fresh.test",
        filename: "test.mp4",
        totalBytesWritten: 0,
        totalBytesExpectedToWrite: 100,
      }),
      onDownloadProgress: jest.fn(() => () => {}),
    } as any;

    jest
      .mocked(streamEngineManager.getPlaybackUri)
      .mockResolvedValue("http://fresh.test");

    const service = new DownloadService();
    const result = await service.resumeDownload(id);

    expect(result.ok).toBe(true);
    expect(streamEngineManager.getPlaybackUri).toHaveBeenCalledWith(
      originalStream,
    );
    expect(window.desktopBridge!.startDownloadJob).toHaveBeenCalledWith(
      id,
      "http://fresh.test",
      expect.any(String),
    );
  });

  it("calculates app download usage from task state", async () => {
    useDownloadStore
      .getState()
      .addTask("task-1", { sourceId: "task-1" } as any);
    useDownloadStore.getState().updateProgress("task-1", 0.5, 500, 1000);
    useDownloadStore
      .getState()
      .addTask("task-2", { sourceId: "task-2" } as any);
    useDownloadStore.getState().updateProgress("task-2", 0.25, 250, 1000);

    const service = new DownloadService();
    const stats = await service.getStorageDiagnostics();

    // appUsage should always be correct regardless of platform
    expect(stats.appUsage).toBe(750);
  });

  it("replans after native restart when resumable state is lost", async () => {
    setPlatform("ios");
    const id = "task-restart";
    const originalStream = { infoHash: "hash-restart" };
    const mediaInfo = {
      type: "movie",
      itemId: "tt-restart",
      title: "Restart Test",
      sourceId: id,
      downloadUrl: "http://expired.test",
    } as any;

    useDownloadStore
      .getState()
      .addTask(id, mediaInfo, undefined, originalStream);
    useDownloadStore.getState().setStatus(id, "Paused");

    jest
      .mocked(streamEngineManager.getPlaybackUri)
      .mockResolvedValue("http://fresh-after-restart.test");

    const service = new DownloadService();
    const startDownloadSpy = jest
      .spyOn(service, "startDownload")
      .mockResolvedValue();

    const result = await service.resumeDownload(id);

    expect(result.ok).toBe(true);
    expect(streamEngineManager.getPlaybackUri).toHaveBeenCalledWith(
      originalStream,
    );
    expect(startDownloadSpy).toHaveBeenCalledWith(
      {
        ...originalStream,
        infoHash: undefined,
        url: "http://fresh-after-restart.test",
      },
      mediaInfo,
      expect.objectContaining({
        resolvedUrl: "http://fresh-after-restart.test",
      }),
    );

    startDownloadSpy.mockRestore();
  });

  it("reads desktop storage diagnostics from the desktop bridge", async () => {
    setPlatform("web");
    window.desktopBridge = {
      getStorageInfo: jest.fn().mockResolvedValue({
        total: 2_000_000,
        free: 1_000_000,
        appUsage: 123_456,
      }),
    } as any;

    const service = new DownloadService();
    const stats = await service.getStorageDiagnostics();

    expect(window.desktopBridge!.getStorageInfo).toHaveBeenCalled();
    expect(stats).toEqual({
      totalSpace: 2_000_000,
      freeSpace: 1_000_000,
      appUsage: 123_456,
    });
  });
});
