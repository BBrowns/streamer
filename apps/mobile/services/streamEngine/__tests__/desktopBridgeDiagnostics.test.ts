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
          },
        },
      }),
    ).toMatchObject({
      status: "unsupported",
      reason: "native-architecture-mismatch",
      processArch: "x64",
      platform: "darwin",
    });
  });
});
