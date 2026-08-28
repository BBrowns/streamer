import {
  buildActionBridgeHint,
  preflightStreamAction,
} from "../actionPreflight";
import {
  __resetDesktopBridgeAccessSessionForTests,
  setDesktopBridgeAccessSession,
} from "../bridgeAuth";
import { useAuthStore } from "../../stores/authStore";
import type { DeviceProfile } from "@streamer/shared";

const electronProfile: DeviceProfile = {
  platform: "electron",
  maxQuality: "1080p",
  network: "local",
  supports: {
    h264: true,
    h265: false,
    av1: false,
    mp4: true,
    mkv: false,
    hls: true,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

describe("action bridge preflight", () => {
  beforeEach(() => {
    __resetDesktopBridgeAccessSessionForTests();
    useAuthStore.setState({ streamServerToken: null });
  });

  afterEach(() => {
    __resetDesktopBridgeAccessSessionForTests();
  });

  it("recognizes a desktop renderer access session as configured bridge auth", () => {
    setDesktopBridgeAccessSession({
      accessToken: "renderer-session-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const bridge = buildActionBridgeHint({
      deviceProfile: electronProfile,
      diagnostics: {
        status: "available",
        url: "http://localhost:11470",
        auth: { required: true, configured: true },
      },
    });

    expect(bridge.auth?.clientConfigured).toBe(true);
    expect(
      preflightStreamAction(
        "play",
        { url: "", infoHash: "a".repeat(40) },
        { deviceProfile: electronProfile, bridge },
      ).reason,
    ).not.toBe("bridge_auth_required");
  });
});
