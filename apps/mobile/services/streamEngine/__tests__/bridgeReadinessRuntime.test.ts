import { Platform } from "react-native";
import { useAuthStore } from "../../../stores/authStore";
import { streamEngineManager } from "../StreamEngineManager";
import {
  __resetBridgeReadinessRuntimeForTests,
  ensureBridgeReadiness,
  getBridgeReadinessSnapshot,
  refreshBridgeReadiness,
  startBridgeReadinessPolling,
  stopBridgeReadinessPolling,
  subscribeBridgeReadiness,
} from "../bridgeReadinessRuntime";
import {
  buildActionBridgeHint,
  preflightStreamAction,
} from "../../actionPreflight";
import { getBridgeAuthHeaders } from "../../bridgeAuth";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const healthy = () => ({
  ok: true,
  json: async () => ({ torrentEngine: { available: true } }),
});
async function flush() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

describe("shared bridge readiness", () => {
  const originalPlatform = Platform.OS;
  const originalDesktopBridge = window.desktopBridge;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    window.desktopBridge = undefined;
    useAuthStore.setState({
      isAuthenticated: true,
      isHydrated: true,
      credentialsHydrated: true,
      streamServerUrl: null,
      streamServerToken: null,
    });
    __resetBridgeReadinessRuntimeForTests();
    global.fetch = jest.fn().mockResolvedValue(healthy());
  });

  afterEach(async () => {
    __resetBridgeReadinessRuntimeForTests();
    await flush();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    window.desktopBridge = originalDesktopBridge;
  });

  it("keeps confirmed health and Play preflight stable through the eight-second refresh", async () => {
    startBridgeReadinessPolling();
    await flush();
    const confirmed = getBridgeReadinessSnapshot().bridgeDiagnostics;
    const response = deferred<ReturnType<typeof healthy>>();
    jest
      .mocked(fetch)
      .mockReturnValueOnce(response.promise as Promise<Response>);

    await jest.advanceTimersByTimeAsync(8000);

    expect(getBridgeReadinessSnapshot()).toMatchObject({
      bridgeAvailable: true,
      bridgeStatus: "available",
      refreshing: true,
      bridgeDiagnostics: confirmed,
    });
    expect(buildActionBridgeHint().status).toBe("available");
    await expect(ensureBridgeReadiness()).resolves.toMatchObject({
      bridgeAvailable: true,
    });
    response.resolve(healthy());
    await flush();
    expect(getBridgeReadinessSnapshot().refreshing).toBe(false);
  });

  it("does not mark an authenticated bridge ready in an unpaired browser", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        torrentEngine: { available: true },
        auth: { required: true, configured: true },
      }),
    } as Response);

    await refreshBridgeReadiness();

    expect(getBridgeReadinessSnapshot()).toMatchObject({
      bridgeStatus: "available",
      bridgeAvailable: false,
    });
    expect(buildActionBridgeHint()).toMatchObject({
      auth: {
        required: true,
        bridgeConfigured: true,
        clientConfigured: false,
      },
    });
  });

  it("marks a paired browser ready when bridge authentication is configured", async () => {
    useAuthStore.setState({ streamServerToken: "paired-browser-token" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        torrentEngine: { available: true },
        auth: { required: true, configured: true },
      }),
    } as Response);

    await refreshBridgeReadiness();

    expect(getBridgeReadinessSnapshot()).toMatchObject({
      bridgeStatus: "available",
      bridgeAvailable: true,
    });
    expect(buildActionBridgeHint()).toMatchObject({
      auth: { clientConfigured: true },
    });
  });

  it("shares initial/full detection and waits for both health and the effective Electron credential", async () => {
    const metadata = deferred<any>();
    window.desktopBridge = {
      getBridgeInfo: jest.fn(() => metadata.promise),
    } as any;
    const response = deferred<ReturnType<typeof healthy>>();
    jest
      .mocked(fetch)
      .mockReturnValueOnce(response.promise as Promise<Response>);
    const refresh = refreshBridgeReadiness();
    const first = ensureBridgeReadiness();
    const second = ensureBridgeReadiness();
    const settled = jest.fn();
    void first.then(settled);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    response.resolve(healthy());
    await flush();
    expect(settled).not.toHaveBeenCalled();
    metadata.resolve({
      available: true,
      localUrl: "http://localhost:11470",
      lanUrl: "",
      accessSession: {
        accessToken: "test-renderer-session",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    });
    const snapshots = await Promise.all([refresh, first, second]);
    expect(snapshots.every((value) => value.bridgeAvailable)).toBe(true);
    expect(window.desktopBridge!.getBridgeInfo).toHaveBeenCalledTimes(1);
    expect(getBridgeAuthHeaders().Authorization).toBe(
      "Bearer test-renderer-session",
    );
    expect(snapshots[0].bridgeInfo).not.toHaveProperty("accessSession");
  });

  it("cancels a waiter promptly without cancelling another consumer's shared probe", async () => {
    const response = deferred<ReturnType<typeof healthy>>();
    jest
      .mocked(fetch)
      .mockReturnValueOnce(response.promise as Promise<Response>);
    const controller = new AbortController();
    const first = ensureBridgeReadiness({ signal: controller.signal });
    const second = ensureBridgeReadiness();
    const cancelled = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    controller.abort();
    await cancelled;
    expect(jest.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(false);
    response.resolve(healthy());
    await expect(second).resolves.toMatchObject({ bridgeAvailable: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not claim Electron readiness when IPC credentials time out, and recovers on refresh", async () => {
    const lateMetadata = deferred<any>();
    const info = {
      available: true,
      localUrl: "http://localhost:11470",
      lanUrl: "",
      accessSession: {
        accessToken: "fresh-test-session",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    };
    window.desktopBridge = {
      getBridgeInfo: jest
        .fn()
        .mockReturnValueOnce(lateMetadata.promise)
        .mockResolvedValue(info),
    } as any;
    const first = ensureBridgeReadiness();
    await jest.advanceTimersByTimeAsync(1500);
    await expect(first).resolves.toMatchObject({
      bridgeStatus: "available",
      bridgeAvailable: false,
      refreshing: false,
    });
    expect(getBridgeAuthHeaders().Authorization).toBeUndefined();
    await expect(refreshBridgeReadiness()).resolves.toMatchObject({
      bridgeAvailable: true,
    });
    lateMetadata.resolve({
      ...info,
      accessSession: {
        ...info.accessSession,
        accessToken: "stale-test-session",
      },
    });
    await flush();
    expect(getBridgeAuthHeaders().Authorization).toBe(
      "Bearer fresh-test-session",
    );
    expect(getBridgeReadinessSnapshot().bridgeInfo).not.toHaveProperty(
      "accessSession",
    );
  });

  it("does not start work for an already-cancelled waiter", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      ensureBridgeReadiness({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["unreachable", "unsupported"])(
    "publishes an actual %s failure and recovers on the next probe",
    async (status) => {
      await refreshBridgeReadiness();
      jest.mocked(fetch).mockResolvedValue({
        ok: status === "unsupported",
        json: async () => ({
          torrentEngine: { available: false, reason: "runtime-unavailable" },
        }),
      } as Response);
      await refreshBridgeReadiness();
      expect(buildActionBridgeHint().status).toBe(status);
      await expect(ensureBridgeReadiness()).resolves.toMatchObject({
        bridgeAvailable: false,
        bridgeStatus: status,
      });
      jest.mocked(fetch).mockResolvedValue(healthy() as Response);
      await refreshBridgeReadiness();
      expect(buildActionBridgeHint().status).toBe("available");
    },
  );

  it.each([
    { streamServerUrl: "http://192.168.1.25:11470" },
    { streamServerToken: "new-test-token" },
    { isAuthenticated: false },
    { credentialsHydrated: false },
  ])(
    "invalidates old in-flight health for a changed scope: %j",
    async (change) => {
      const response = deferred<ReturnType<typeof healthy>>();
      jest
        .mocked(fetch)
        .mockReturnValueOnce(response.promise as Promise<Response>);
      const old = refreshBridgeReadiness();
      const cancelled = expect(old).rejects.toMatchObject({
        name: "AbortError",
      });
      await flush();
      useAuthStore.setState(change);
      await cancelled;
      expect(jest.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
      expect(getBridgeReadinessSnapshot().bridgeStatus).toBe("loading");
      response.resolve(healthy());
      await flush();
      expect(getBridgeReadinessSnapshot().bridgeAvailable).toBe(false);
      if (
        change.isAuthenticated !== false &&
        change.credentialsHydrated !== false
      ) {
        await expect(ensureBridgeReadiness()).resolves.toMatchObject({
          bridgeAvailable: true,
        });
      }
    },
  );

  it("does not let old metadata replace a new access session after a configuration race", async () => {
    const metadata = deferred<any>();
    window.desktopBridge = {
      getBridgeInfo: jest
        .fn()
        .mockReturnValueOnce(metadata.promise)
        .mockResolvedValue({
          available: true,
          localUrl: "http://localhost:11470",
          lanUrl: "",
          accessSession: {
            accessToken: "new-test-session",
            expiresAt: "2099-01-01T00:00:00Z",
          },
        }),
    } as any;
    const old = refreshBridgeReadiness();
    const cancelled = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    useAuthStore.setState({ streamServerToken: "new-test-pairing" });
    await cancelled;
    await refreshBridgeReadiness();
    metadata.resolve({
      available: true,
      localUrl: "",
      lanUrl: "",
      accessSession: {
        accessToken: "old-test-session",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    });
    await flush();
    expect(getBridgeAuthHeaders().Authorization).toBe(
      "Bearer new-test-session",
    );
  });

  it("bounds a stalled response body and stops invalidated work without legacy fallback", async () => {
    const body = deferred<unknown>();
    jest
      .mocked(fetch)
      .mockResolvedValue({ ok: true, json: () => body.promise } as Response);
    const refresh = refreshBridgeReadiness();
    await jest.advanceTimersByTimeAsync(9000);
    await expect(refresh).resolves.toMatchObject({ bridgeAvailable: false });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("pauses polling without discarding a confirmed snapshot and never polls unauthenticated", async () => {
    startBridgeReadinessPolling();
    await flush();
    stopBridgeReadinessPolling();
    await jest.advanceTimersByTimeAsync(16000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getBridgeReadinessSnapshot().bridgeAvailable).toBe(true);
    useAuthStore.setState({ isAuthenticated: false });
    startBridgeReadinessPolling();
    await jest.advanceTimersByTimeAsync(16000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("only notifies for refreshing transitions on unchanged health and does not repeat logs", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await refreshBridgeReadiness();
    log.mockClear();
    const listener = jest.fn();
    const unsubscribe = subscribeBridgeReadiness(listener);
    await refreshBridgeReadiness();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("leaves direct Play usable without starting bridge detection", () => {
    expect(
      preflightStreamAction("play", {
        url: "https://cdn.example.test/video.mp4",
      }).ready,
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(streamEngineManager.bridgeStatus).toBe("loading");
  });
});
