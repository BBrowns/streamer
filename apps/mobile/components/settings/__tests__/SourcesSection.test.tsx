import React from "react";
import { Platform } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SourcesSection } from "../SourcesSection";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("SourcesSection", () => {
  const originalPlatform = Platform.OS;
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    jest.spyOn(streamEngineManager, "detectBridge").mockResolvedValue(false);
    jest.spyOn(streamEngineManager, "getBridgeDiagnostics").mockReturnValue({
      status: "unsupported",
      reason: "native-architecture-mismatch",
    });
    streamEngineManager.bridgeStatus = "unsupported";
    window.desktopBridge = {
      getBridgeInfo: jest.fn().mockResolvedValue({
        available: false,
        localUrl: "http://localhost:11470",
        lanUrl: "http://192.168.1.25:11470",
        diagnostics: {
          status: "running",
          health: {
            selfTest: {
              status: "pass",
              checks: [
                {
                  name: "gateway-readiness",
                  status: "pass",
                  message:
                    "Gateway waits for remux cache or first bytes before ready.",
                },
              ],
            },
            torrentEngine: {
              available: false,
              reason: "native-architecture-mismatch",
              message: "Native module architecture mismatch",
              processArch: "x64",
              platform: "darwin",
            },
            remuxRuntime: {
              available: false,
              state: "unavailable",
              reason: "ffmpeg-not-found",
              message: "FFmpeg binary was not found.",
            },
            remuxCache: {
              entryCount: 2,
              pendingCount: 1,
              totalBytes: 1024,
              maxBytes: 2048,
            },
            torrentCache: {
              rootDir: "/Users/example/Library/Caches/Streamer/webtorrent",
              entryCount: 3,
              totalBytes: 4096,
              maxBytes: 8192,
              ttlMs: 86400000,
            },
          },
        },
      }),
      restartBridge: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    window.desktopBridge = originalDesktopBridge;
  });

  it("shows runtime re-check and remux diagnostics in advanced details", async () => {
    const screen = render(<SourcesSection />);

    await waitFor(() => {
      expect(screen.getByText("Re-check runtime")).toBeTruthy();
      expect(screen.getByText("Copy diagnostics")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Advanced diagnostics"));

    await waitFor(() => {
      expect(screen.getByText("FFmpeg: Unavailable")).toBeTruthy();
      expect(screen.getByText("Remux cache: 2 files · 1 pending")).toBeTruthy();
      expect(
        screen.getByText("Torrent cache: 3 entries · 4 KB / 8 KB"),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "gateway-readiness: Gateway waits for remux cache or first bytes before ready.",
        ),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Re-check runtime"));

    await waitFor(() => {
      expect(window.desktopBridge?.getBridgeInfo).toHaveBeenCalledTimes(2);
    });
  });
});
