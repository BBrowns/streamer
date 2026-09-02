import { SyncClient, type SyncAuthState } from "../syncClient";

type FakeSocket = {
  readyState: number;
  close: jest.Mock;
  send: jest.Mock;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: (event: unknown) => void;
  onclose?: (event: { code: number; reason: string }) => void;
};

const OPEN = 1;

function createAuthState(): SyncAuthState {
  return {
    isAuthenticated: true,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    deviceId: "device-id",
    tokenExpiresAt: Date.now() + 60_000,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SyncClient", () => {
  let auth: SyncAuthState;
  let sockets: FakeSocket[];
  let createSocket: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    auth = createAuthState();
    sockets = [];
    createSocket = jest.fn((accessToken: string, deviceId: string | null) => {
      expect(accessToken).toBeTruthy();
      expect(deviceId).toBe("device-id");
      const socket: FakeSocket = {
        readyState: 0,
        close: jest.fn(),
        send: jest.fn(),
      };
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("creates one socket when start is called more than once", async () => {
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth: jest.fn().mockResolvedValue("access-token"),
    });

    client.start();
    client.start();
    await flushAsyncWork();

    expect(createSocket).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it("does not reconnect after an intentional stop", async () => {
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
    });

    client.start();
    await flushAsyncWork();
    const socket = sockets[0];

    client.stop();
    socket.onclose?.({ code: 1000, reason: "stopped" });
    jest.advanceTimersByTime(60_000);

    expect(createSocket).toHaveBeenCalledTimes(1);
  });

  it("reconnects once after a transport failure and ignores stale close events", async () => {
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth: jest.fn().mockResolvedValue("access-token"),
      random: () => 0.5,
    });

    client.start();
    await flushAsyncWork();
    const firstSocket = sockets[0];
    const staleClose = firstSocket.onclose;

    firstSocket.onclose?.({ code: 1006, reason: "network" });
    jest.advanceTimersByTime(2_100);
    await flushAsyncWork();

    expect(createSocket).toHaveBeenCalledTimes(2);

    sockets[1].onopen?.();
    staleClose?.({ code: 1005, reason: "stale" });
    jest.advanceTimersByTime(60_000);

    expect(createSocket).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired token before opening the socket", async () => {
    auth.tokenExpiresAt = Date.now() - 1;
    const refreshAuth = jest.fn(async () => {
      auth.tokenExpiresAt = Date.now() + 60_000;
      return "fresh-access-token";
    });
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
    });

    client.start();
    await flushAsyncWork();

    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(createSocket).toHaveBeenCalledWith(
      "fresh-access-token",
      "device-id",
    );
    client.stop();
  });

  it("does not retry when token refresh fails", async () => {
    auth.tokenExpiresAt = Date.now() - 1;
    const refreshAuth = jest
      .fn()
      .mockRejectedValue(new Error("refresh failed"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
    });

    client.start();
    await flushAsyncWork();
    jest.advanceTimersByTime(60_000);

    expect(createSocket).not.toHaveBeenCalled();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
  });

  it("reports transient refresh failure as degraded instead of stopping auth", async () => {
    auth.tokenExpiresAt = Date.now() - 1;
    const refreshAuth = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("network unavailable"), { kind: "network" }),
      );
    const statuses: string[] = [];
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
    });
    client.subscribeStatus((status) => statuses.push(status.state));

    client.start();
    await flushAsyncWork();

    expect(statuses).toContain("degraded");
    expect(client.getStatus().state).toBe("degraded");
    expect(createSocket).not.toHaveBeenCalled();
    client.stop();
  });

  it("waits for a refresh cooldown before retrying a rate-limited session", async () => {
    auth.tokenExpiresAt = Date.now() - 1;
    const refreshAuth = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), {
          kind: "rate-limited",
          retryAfterMs: 7_000,
        }),
      )
      .mockResolvedValue("access-token");
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
      random: () => 0,
    });

    client.start();
    await flushAsyncWork();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(client.getStatus().retryDelayMs).toBeGreaterThanOrEqual(7_000);

    jest.advanceTimersByTime(6_999);
    await flushAsyncWork();
    expect(refreshAuth).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_001);
    await flushAsyncWork();
    expect(refreshAuth).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("returns to connected after manually retrying a transient refresh failure", async () => {
    let now = Date.now();
    auth.tokenExpiresAt = now + 30_000;
    const refreshAuth = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("network unavailable"), { kind: "network" }),
      )
      .mockImplementation(async () => {
        auth.tokenExpiresAt = now + 60_000;
        return "access-token";
      });
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
      now: () => now,
    });

    client.start();
    await flushAsyncWork();
    sockets[0].readyState = OPEN;
    sockets[0].onopen?.();
    jest.advanceTimersByTime(1);
    await flushAsyncWork();

    expect(client.getStatus().state).toBe("degraded");

    client.retryNow();
    await flushAsyncWork();

    expect(refreshAuth).toHaveBeenCalledTimes(2);
    expect(client.getStatus().state).toBe("connected");
    client.stop();
  });

  it("pauses reconnects while inactive and reconnects once on activation", async () => {
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth: jest.fn().mockResolvedValue("access-token"),
    });

    client.start();
    await flushAsyncWork();
    sockets[0].onclose?.({ code: 1006, reason: "network" });
    client.setActive(false);
    jest.advanceTimersByTime(60_000);
    expect(createSocket).toHaveBeenCalledTimes(1);

    client.setActive(true);
    await flushAsyncWork();
    expect(createSocket).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("bounds reconnect delays and emits one degraded state per failed socket", async () => {
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth: jest.fn().mockResolvedValue("access-token"),
      random: () => 0.5,
    });
    const statuses: string[] = [];
    client.subscribeStatus((status) => statuses.push(status.state));

    client.start();
    await flushAsyncWork();
    sockets[0].onclose?.({ code: 1006, reason: "network" });
    expect(client.getStatus().retryDelayMs).toBeGreaterThan(0);
    expect(statuses.filter((state) => state === "degraded")).toHaveLength(1);

    jest.advanceTimersByTime(60_000);
    await flushAsyncWork();
    expect(createSocket).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("refreshes proactively before the access token expires", async () => {
    let now = 1_000_000;
    auth.tokenExpiresAt = now + 31_000;
    const refreshAuth = jest.fn(async () => {
      auth.accessToken = "rotated-access-token";
      auth.tokenExpiresAt = now + 60_000;
      return auth.accessToken;
    });
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
      now: () => now,
    });

    client.start();
    await flushAsyncWork();
    sockets[0].onopen?.();

    now += 1_000;
    jest.advanceTimersByTime(1_000);
    await flushAsyncWork();

    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(auth.accessToken).toBe("rotated-access-token");
    client.stop();
  });

  it("does not let an old refresh block a new lifecycle", async () => {
    auth.tokenExpiresAt = Date.now() - 1;
    const refreshAuth = jest.fn(() => new Promise<string>(() => {}));
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth,
    });

    client.start();
    await flushAsyncWork();
    expect(refreshAuth).toHaveBeenCalledTimes(1);

    client.stop();
    auth.accessToken = "fresh-access-token";
    auth.tokenExpiresAt = Date.now() + 60_000;
    client.start();
    await flushAsyncWork();

    expect(createSocket).toHaveBeenCalledWith(
      "fresh-access-token",
      "device-id",
    );
    client.stop();
  });

  it("delivers parsed messages to subscribers and sends only on an open socket", async () => {
    const listener = jest.fn();
    const client = new SyncClient({
      getAuth: () => auth,
      createSocket,
    });

    client.subscribe(listener);
    client.start();
    await flushAsyncWork();
    const socket = sockets[0];
    socket.readyState = OPEN;
    socket.onopen?.();

    socket.onmessage?.({
      data: JSON.stringify({
        event: "REMOTE_COMMAND",
        data: { action: "pause" },
      }),
    });
    client.sendMessage("playback_update", { state: "paused" });

    expect(listener).toHaveBeenCalledWith({
      event: "REMOTE_COMMAND",
      data: { action: "pause" },
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ event: "playback_update", data: { state: "paused" } }),
    );
    client.stop();
  });
});
