import { diagnosticsFromDesktopBridge } from "../desktopBridgeDiagnostics";

describe("diagnosticsFromDesktopBridge", () => {
  it("maps a running desktop bridge to available", () => {
    expect(
      diagnosticsFromDesktopBridge({
        available: true,
        localUrl: "http://localhost:11470",
        lanUrl: "http://192.168.1.10:11470",
        diagnostics: {
          status: "running",
          nodeArch: "arm64",
          platform: "darwin",
        },
      }),
    ).toMatchObject({
      status: "available",
      processArch: "arm64",
      runtimeArch: "arm64",
      platform: "darwin",
    });
  });

  it("keeps torrent engine architecture failures as unsupported", () => {
    expect(
      diagnosticsFromDesktopBridge({
        available: false,
        localUrl: "http://localhost:11470",
        lanUrl: "http://192.168.1.10:11470",
        diagnostics: {
          status: "running",
          health: {
            torrentEngine: {
              available: false,
              reason: "native-architecture-mismatch",
              message: "Native module architecture mismatch",
              processArch: "x64",
              platform: "darwin",
            },
            runtime: {
              nodeArch: "x64",
              nativeArch: "arm64",
              platform: "darwin",
              architectureMismatch: true,
            },
            selfTest: {
              status: "fail",
              summary: "Bridge runtime self-test found an issue.",
            },
            repair: {
              required: true,
              reason: "native-architecture-mismatch",
              actionLabel: "Repair runtime",
              steps: ["Install matching Node.js", "Restart the desktop app"],
            },
          },
        },
      }),
    ).toMatchObject({
      status: "unsupported",
      reason: "native-architecture-mismatch",
      processArch: "x64",
      runtimeArch: "x64",
      nativeArch: "arm64",
      platform: "darwin",
      selfTest: {
        status: "fail",
      },
      repair: {
        required: true,
        actionLabel: "Repair runtime",
      },
    });
  });

  it("creates repair steps from desktop startup errors without bridge health", () => {
    expect(
      diagnosticsFromDesktopBridge({
        available: false,
        localUrl: "http://localhost:11470",
        lanUrl: "http://192.168.1.10:11470",
        diagnostics: {
          status: "error",
          reason: "missing-stream-server-build",
          error: "Stream server entrypoint not found",
          nodeArch: "arm64",
          nativeArch: "arm64",
          platform: "darwin",
        },
      }),
    ).toMatchObject({
      status: "unsupported",
      reason: "missing-stream-server-build",
      repair: {
        required: true,
        actionLabel: "Build bridge",
      },
    });
  });

  it("preserves remux and torrent cache diagnostics from bridge health", () => {
    expect(
      diagnosticsFromDesktopBridge({
        available: true,
        localUrl: "http://localhost:11470",
        lanUrl: "http://192.168.1.10:11470",
        diagnostics: {
          status: "running",
          health: {
            torrentEngine: {
              available: true,
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
    ).toMatchObject({
      remuxRuntime: {
        available: false,
        reason: "ffmpeg-not-found",
      },
      remuxCache: {
        entryCount: 2,
        pendingCount: 1,
      },
      torrentCache: {
        entryCount: 3,
        totalBytes: 4096,
        maxBytes: 8192,
      },
    });
  });
});
