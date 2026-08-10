import { useAuthStore } from "../../stores/authStore";
import {
  __resetDesktopBridgeAccessSessionForTests,
  getBridgeAuthHeaders,
  refreshDesktopBridgeAccessSession,
  setDesktopBridgeAccessSession,
} from "../bridgeAuth";

describe("desktop bridge access sessions", () => {
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    __resetDesktopBridgeAccessSessionForTests();
    useAuthStore.setState({ streamServerToken: "manual-pairing-token" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.desktopBridge = originalDesktopBridge;
  });

  it("prefers a fresh memory-only desktop session over the persisted token", () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-01T02:00:00Z"));
    setDesktopBridgeAccessSession({
      accessToken: "scoped-session-token",
      expiresAt: "2026-08-01T02:05:00Z",
    });

    expect(getBridgeAuthHeaders()).toEqual({
      Authorization: "Bearer scoped-session-token",
    });
  });

  it.each(["2026-08-01T01:59:59Z", "not-a-date"])(
    "rejects an expired or malformed desktop session (%s)",
    (expiresAt) => {
      jest
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse("2026-08-01T02:00:00Z"));
      setDesktopBridgeAccessSession({
        accessToken: "stale-session-token",
        expiresAt,
      });

      expect(getBridgeAuthHeaders()).toEqual({
        Authorization: "Bearer manual-pairing-token",
      });
    },
  );

  it("returns no authorization header after both credentials are cleared", () => {
    useAuthStore.setState({ streamServerToken: null });
    setDesktopBridgeAccessSession(null);

    expect(getBridgeAuthHeaders()).toEqual({});
  });

  it("rotates the scoped session through the narrow desktop IPC", async () => {
    useAuthStore.setState({ streamServerToken: null });
    window.desktopBridge = {
      refreshBridgeAccessSession: jest.fn().mockResolvedValue({
        accessToken: "rotated-session-token",
        expiresAt: "2026-08-01T02:05:00Z",
      }),
    } as any;
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-01T02:00:00Z"));

    await expect(refreshDesktopBridgeAccessSession()).resolves.toBe(true);
    expect(getBridgeAuthHeaders()).toEqual({
      Authorization: "Bearer rotated-session-token",
    });
  });
});
