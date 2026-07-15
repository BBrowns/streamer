import React from "react";
import { Alert, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AdvancedSourcesSection, SourcesSection } from "../SourcesSection";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";
import { useAuthStore } from "../../../stores/authStore";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Sources and Advanced ownership", () => {
  const originalPlatform = Platform.OS;
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    useAuthStore.setState({ streamServerToken: "pairing-token" });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cleanup: { removedEntries: 1, freedBytes: 4096 } }),
    }) as any;
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
                  message: "Gateway waits for first bytes before ready.",
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
              rootDir: "/cache/webtorrent",
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
    act(() => {
      useAuthStore.setState({ streamServerToken: null });
    });
    global.fetch = undefined as any;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    window.desktopBridge = originalDesktopBridge;
  });

  it("keeps consumer readiness, add-ons and device capabilities in Sources", async () => {
    const screen = render(<SourcesSection />);

    await waitFor(() => {
      expect(screen.getByText("Content Add-ons")).toBeTruthy();
      expect(screen.getByText("Local Playback Service")).toBeTruthy();
      expect(screen.getByText("Casting & Devices")).toBeTruthy();
    });
    expect(screen.queryByText("Backend API URL")).toBeNull();
    expect(screen.queryByText("Real-Debrid")).toBeNull();
  });

  it("keeps connection, maintenance and collapsed diagnostics in Advanced", async () => {
    const screen = render(<AdvancedSourcesSection />);

    await waitFor(() => {
      expect(screen.getByText("Backend API URL")).toBeTruthy();
      expect(screen.getByText("Re-check runtime")).toBeTruthy();
      expect(screen.getByText("Export diagnostics")).toBeTruthy();
    });

    expect(screen.queryByText("Ready to play")).toBeNull();
    expect(screen.queryByText("Content Add-ons")).toBeNull();
    expect(screen.queryByText("Real-Debrid")).toBeNull();
    expect(screen.queryByText("FFmpeg: Unavailable")).toBeNull();

    fireEvent.press(screen.getByText("Runtime and build details"));

    await waitFor(() => {
      expect(screen.getByText("FFmpeg: Unavailable")).toBeTruthy();
      expect(screen.getByText("Remux cache: 2 files · 1 pending")).toBeTruthy();
      expect(
        screen.getByText(
          "gateway-readiness: Gateway waits for first bytes before ready.",
        ),
      ).toBeTruthy();
    });
  });

  it("cleans inactive playback cache through the configured service", async () => {
    const screen = render(<AdvancedSourcesSection />);

    await waitFor(() => {
      expect(screen.getByText("Clean playback cache")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Clean playback cache"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://192.168.1.25:11470/api/cache/torrent/cleanup",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer pairing-token",
          }),
        }),
      );
      expect(Alert.alert).toHaveBeenCalledWith(
        "Playback cache cleaned",
        "Removed 1 inactive cache entry and freed 4 KB.",
      );
    });
  });

  it("warns native users when their configured service URL is loopback", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });
    window.desktopBridge = undefined;
    useAuthStore.setState({
      streamServerUrl: "http://localhost:11470",
      streamServerToken: "pairing-token",
    });
    jest
      .spyOn(streamEngineManager, "getBridgeUrl")
      .mockReturnValue("http://localhost:11470");

    const screen = render(<AdvancedSourcesSection />);

    await waitFor(() => {
      expect(
        screen.getByText("Use the desktop service LAN address"),
      ).toBeTruthy();
    });
  });
});
