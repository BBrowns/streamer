import { Platform } from "react-native";
import { createSyncWebSocketProtocols } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";
import { BASE_URL, refreshAuthSession } from "./api";

const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
const TOKEN_REFRESH_SKEW_MS = 30_000;

export type SyncAuthState = {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  tokenExpiresAt: number | null;
};

export type SyncMessage = {
  event: string;
  data: unknown;
};

export type SyncStatusState =
  "stopped" | "connecting" | "connected" | "degraded" | "paused";

export type SyncStatusReason =
  "transport" | "auth-refresh" | "rate-limited" | "inactive" | null;

export type SyncStatusSnapshot = {
  state: SyncStatusState;
  reason: SyncStatusReason;
  attempt: number;
  retryAt: number | null;
  retryDelayMs: number | null;
};

type SyncSocket = WebSocket;
type SyncListener = (message: SyncMessage) => void;
type SyncStatusListener = (status: SyncStatusSnapshot) => void;
type Timer = ReturnType<typeof setTimeout>;

type NativeWebSocketConstructor = {
  new (
    url: string,
    protocols?: string | string[] | null,
    options?: { headers?: Record<string, string> },
  ): SyncSocket;
};

export type SyncClientOptions = {
  getAuth?: () => SyncAuthState;
  createSocket?: (accessToken: string, deviceId: string | null) => SyncSocket;
  refreshAuth?: () => Promise<string>;
  now?: () => number;
  random?: () => number;
};

const log = (...args: unknown[]) => {
  if (__DEV__) console.log("[Sync]", ...args);
};

const warn = (...args: unknown[]) => {
  if (__DEV__) console.warn("[Sync]", ...args);
};

const errorLog = (...args: unknown[]) => {
  if (__DEV__) console.error("[Sync]", ...args);
};

function getDefaultAuth(): SyncAuthState {
  const {
    isAuthenticated,
    accessToken,
    refreshToken,
    deviceId,
    tokenExpiresAt,
  } = useAuthStore.getState();
  return {
    isAuthenticated,
    accessToken,
    refreshToken,
    deviceId,
    tokenExpiresAt,
  };
}

function createDefaultSocket(
  accessToken: string,
  deviceId: string | null,
): SyncSocket {
  const backendUrl = useAuthStore.getState().backendUrl || BASE_URL;
  const wsUrl = backendUrl.replace(/^http/, "ws") + "/api/sync/events";
  const WebSocketConstructor =
    WebSocket as unknown as NativeWebSocketConstructor;

  log("Connecting");

  if (Platform.OS === "web") {
    return new WebSocketConstructor(
      wsUrl,
      createSyncWebSocketProtocols(accessToken, deviceId),
    );
  }

  return new WebSocketConstructor(wsUrl, undefined, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Device-Id": deviceId || "unknown",
    },
  });
}

function getRefreshFailureKind(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const kind = (error as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}

function getRefreshRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
    ? retryAfterMs
    : null;
}

function isRetryableRefreshFailure(error: unknown): boolean {
  const kind = getRefreshFailureKind(error);
  return kind === "rate-limited" || kind === "temporarily-unavailable";
}

export class SyncClient {
  private readonly getAuth: () => SyncAuthState;
  private readonly createSocket: (
    accessToken: string,
    deviceId: string | null,
  ) => SyncSocket;
  private readonly refreshAuth: () => Promise<string>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly listeners = new Set<SyncListener>();
  private readonly statusListeners = new Set<SyncStatusListener>();

  private started = false;
  private active = true;
  private socket: SyncSocket | null = null;
  private socketDeviceId: string | null = null;
  private socketSequence = 0;
  private activeSocketSequence = 0;
  private lifecycleSequence = 0;
  private connectInFlight: Promise<void> | null = null;
  private connectInFlightLifecycleSequence: number | null = null;
  private retryCount = 0;
  private retryTimer: Timer | null = null;
  private tokenRefreshTimer: Timer | null = null;
  private authRetryTimer: Timer | null = null;
  private pendingPlaybackUpdate: SyncMessage | null = null;
  private status: SyncStatusSnapshot = {
    state: "stopped",
    reason: null,
    attempt: 0,
    retryAt: null,
    retryDelayMs: null,
  };

  constructor(options: SyncClientOptions = {}) {
    this.getAuth = options.getAuth ?? getDefaultAuth;
    this.createSocket = options.createSocket ?? createDefaultSocket;
    this.refreshAuth = options.refreshAuth ?? refreshAuthSession;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!this.active) {
      this.setStatus("paused", "inactive");
      return;
    }
    this.setStatus("connecting");
    void this.connectIfNeeded();
  }

  updateAuth(): void {
    const auth = this.getAuth();
    if (!auth.isAuthenticated || !auth.accessToken) {
      this.stop();
      return;
    }

    if (!this.active) {
      this.setStatus("paused", "inactive");
      return;
    }

    if (this.socket && this.socketDeviceId !== auth.deviceId) {
      this.restartForDevice();
      return;
    }

    if (!this.started) {
      this.start();
      return;
    }

    if (this.socket) this.scheduleTokenRefresh();
    void this.connectIfNeeded();
  }

  stop(): void {
    this.started = false;
    this.lifecycleSequence += 1;
    this.retryCount = 0;
    this.clearRetryTimer();
    this.clearTokenRefreshTimer();
    this.clearAuthRetryTimer();
    this.pendingPlaybackUpdate = null;
    this.closeSocket();
    this.setStatus("stopped");
  }

  setActive(active: boolean): void {
    if (this.active === active) {
      if (active && this.started) void this.connectIfNeeded();
      return;
    }

    this.active = active;
    if (!active) {
      this.lifecycleSequence += 1;
      this.clearRetryTimer();
      this.clearTokenRefreshTimer();
      this.clearAuthRetryTimer();
      this.closeSocket();
      if (this.started) this.setStatus("paused", "inactive");
      return;
    }

    if (this.started) {
      this.retryCount = 0;
      this.setStatus("connecting");
      void this.connectIfNeeded();
    }
  }

  retryNow(): void {
    if (!this.started || !this.active) return;

    if (this.socket) {
      // A proactive refresh keeps the transport alive. Do not put the live
      // socket into a fake connecting state or bypass a server cooldown.
      if (this.authRetryTimer) return;
      this.retryCount = 0;
      void this.refreshToken();
      return;
    }

    this.clearRetryTimer();
    this.clearAuthRetryTimer();
    this.retryCount = 0;
    this.setStatus("connecting");
    void this.connectIfNeeded();
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): SyncStatusSnapshot {
    return this.status;
  }

  sendMessage(event: string, data: unknown): void {
    if (!this.socket || this.socket.readyState !== 1) {
      if (event === "playback_update") {
        // Playback ticks are state, not an append-only event stream. Keep only
        // the latest closed-connection update and flush it once on reconnect.
        this.pendingPlaybackUpdate = { event, data };
      }
      return;
    }

    try {
      this.socket.send(JSON.stringify({ event, data }));
    } catch {
      warn("Failed to send WebSocket message", event);
      if (event === "playback_update") {
        this.pendingPlaybackUpdate = { event, data };
      }
    }
  }

  private async connectIfNeeded(): Promise<void> {
    if (
      !this.started ||
      !this.active ||
      this.socket ||
      this.retryTimer ||
      (this.connectInFlight &&
        this.connectInFlightLifecycleSequence === this.lifecycleSequence)
    ) {
      return;
    }

    const lifecycleSequence = this.lifecycleSequence;
    const connection = this.prepareAndConnect(lifecycleSequence).finally(() => {
      if (this.connectInFlight === connection) {
        this.connectInFlight = null;
        this.connectInFlightLifecycleSequence = null;
      }
    });
    this.connectInFlight = connection;
    this.connectInFlightLifecycleSequence = lifecycleSequence;
    await connection;
  }

  private async prepareAndConnect(lifecycleSequence: number): Promise<void> {
    let auth = this.getAuth();
    if (!this.canConnect(auth)) return;

    if (!auth.tokenExpiresAt || this.now() >= auth.tokenExpiresAt) {
      try {
        const refreshedAccessToken = await this.refreshAuth();
        if (!this.isCurrentLifecycle(lifecycleSequence)) return;
        auth = this.getAuth();
        auth = { ...auth, accessToken: refreshedAccessToken };
      } catch (error) {
        if (!this.isCurrentLifecycle(lifecycleSequence)) return;
        if (
          !this.getAuth().isAuthenticated ||
          getRefreshFailureKind(error) === "invalid-credentials"
        ) {
          this.stop();
          return;
        }

        const kind = getRefreshFailureKind(error);
        const reason: SyncStatusReason =
          kind === "rate-limited" ? "rate-limited" : "auth-refresh";
        this.setStatus("degraded", reason);
        if (isRetryableRefreshFailure(error)) {
          this.scheduleRetry(getRefreshRetryAfter(error), reason);
        }
        return;
      }
    }

    if (!this.isCurrentLifecycle(lifecycleSequence) || !this.canConnect(auth)) {
      return;
    }

    this.openSocket(auth.accessToken as string, auth.deviceId);
  }

  private openSocket(accessToken: string, deviceId: string | null): void {
    if (!this.started || !this.active || this.socket) return;

    let socket: SyncSocket;
    try {
      socket = this.createSocket(accessToken, deviceId);
    } catch {
      errorLog("Failed to create WebSocket");
      this.scheduleRetry(undefined, "transport");
      return;
    }

    const socketSequence = ++this.socketSequence;
    this.activeSocketSequence = socketSequence;
    this.socket = socket;
    this.socketDeviceId = deviceId;

    socket.onopen = () => {
      if (!this.isActiveSocket(socket, socketSequence)) return;
      log("Connection opened");
      this.retryCount = 0;
      this.clearRetryTimer();
      this.clearAuthRetryTimer();
      this.setStatus("connected");
      const pendingPlaybackUpdate = this.pendingPlaybackUpdate;
      this.pendingPlaybackUpdate = null;
      if (pendingPlaybackUpdate) {
        try {
          socket.send(JSON.stringify(pendingPlaybackUpdate));
        } catch {
          this.pendingPlaybackUpdate = pendingPlaybackUpdate;
        }
      }
      this.scheduleTokenRefresh();
    };

    socket.onmessage = (event) => {
      if (!this.isActiveSocket(socket, socketSequence)) return;

      try {
        const message = JSON.parse(event.data) as SyncMessage;
        if (typeof message.event !== "string") {
          throw new Error("Missing Sync event type");
        }
        log("Event received:", message.event);
        this.listeners.forEach((listener) => {
          try {
            listener(message);
          } catch {
            errorLog("Sync message handler failed");
          }
        });
      } catch {
        errorLog("Failed to parse WebSocket message");
      }
    };

    socket.onerror = () => {
      if (!this.isActiveSocket(socket, socketSequence)) return;
      // Browser WebSocket errors intentionally expose no useful diagnostic
      // details. The following close event is the single failure signal.
    };

    socket.onclose = (event) => {
      if (!this.isActiveSocket(socket, socketSequence)) return;

      log("Connection closed", {
        code: event.code,
        wasClean: event.wasClean === true,
      });
      this.socket = null;
      this.socketDeviceId = null;
      this.activeSocketSequence = 0;
      this.clearTokenRefreshTimer();
      this.scheduleRetry(undefined, "transport");
    };
  }

  private scheduleRetry(
    requestedDelayMs?: number | null,
    reason: SyncStatusReason = "transport",
  ): void {
    if (!this.started || !this.active || this.retryTimer || this.socket) return;

    const hasServerCooldown =
      requestedDelayMs !== undefined && requestedDelayMs !== null;
    const baseDelay = hasServerCooldown
      ? requestedDelayMs
      : Math.min(
          INITIAL_RETRY_DELAY_MS * 2 ** this.retryCount,
          MAX_RETRY_DELAY_MS,
        );
    const random = Math.min(Math.max(this.random(), 0), 1);
    const jitter = hasServerCooldown ? 1 + random * 0.2 : 0.8 + random * 0.4;
    const delay = Math.min(
      Math.max(0, Math.round(baseDelay * jitter)),
      MAX_RETRY_DELAY_MS,
    );
    this.retryCount += 1;
    const retryAt = this.now() + delay;
    this.setStatus("degraded", reason, {
      attempt: this.retryCount,
      retryAt,
      retryDelayMs: delay,
    });
    log("Reconnect scheduled", {
      attempt: this.retryCount,
      retryDelayMs: delay,
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.active) this.setStatus("connecting");
      void this.connectIfNeeded();
    }, delay);
  }

  private scheduleTokenRefresh(): void {
    this.clearTokenRefreshTimer();
    if (!this.started) return;

    const { tokenExpiresAt } = this.getAuth();
    if (!tokenExpiresAt) return;

    const delay = Math.max(
      0,
      tokenExpiresAt - this.now() - TOKEN_REFRESH_SKEW_MS,
    );
    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null;
      void this.refreshToken();
    }, delay);
  }

  private async refreshToken(): Promise<void> {
    if (!this.started) return;

    const auth = this.getAuth();
    if (!auth.isAuthenticated || !auth.refreshToken) {
      this.stop();
      return;
    }

    if (
      auth.tokenExpiresAt &&
      this.now() < auth.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS
    ) {
      this.scheduleTokenRefresh();
      if (this.socket?.readyState === 1) this.setStatus("connected");
      return;
    }

    try {
      await this.refreshAuth();
      if (this.started) {
        if (this.socket?.readyState === 1) this.setStatus("connected");
        this.scheduleTokenRefresh();
      }
    } catch (error) {
      if (!this.started) return;
      if (
        !this.getAuth().isAuthenticated ||
        getRefreshFailureKind(error) === "invalid-credentials"
      ) {
        this.stop();
        return;
      }

      const kind = getRefreshFailureKind(error);
      const reason: SyncStatusReason =
        kind === "rate-limited" ? "rate-limited" : "auth-refresh";
      this.setStatus("degraded", reason);
      if (isRetryableRefreshFailure(error)) {
        this.scheduleAuthRetry(getRefreshRetryAfter(error), reason);
      }
    }
  }

  private restartForDevice(): void {
    log("Restarting Sync connection after device change");
    this.lifecycleSequence += 1;
    this.retryCount = 0;
    this.clearRetryTimer();
    this.clearTokenRefreshTimer();
    this.clearAuthRetryTimer();
    this.closeSocket();
    if (this.started) void this.connectIfNeeded();
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.socketDeviceId = null;
    this.activeSocketSequence = 0;
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      warn("Failed to close WebSocket");
    }
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTokenRefreshTimer(): void {
    if (!this.tokenRefreshTimer) return;
    clearTimeout(this.tokenRefreshTimer);
    this.tokenRefreshTimer = null;
  }

  private scheduleAuthRetry(
    delayMs: number | null,
    reason: SyncStatusReason = "auth-refresh",
  ): void {
    if (!this.started || !this.active || this.authRetryTimer) return;

    const delay = Math.min(
      Math.max(delayMs ?? INITIAL_RETRY_DELAY_MS, 0),
      MAX_RETRY_DELAY_MS,
    );
    this.setStatus("degraded", reason, {
      retryAt: this.now() + delay,
      retryDelayMs: delay,
    });
    log("Auth retry scheduled", { reason, retryDelayMs: delay });
    this.authRetryTimer = setTimeout(() => {
      this.authRetryTimer = null;
      void this.refreshToken();
    }, delay);
  }

  private clearAuthRetryTimer(): void {
    if (!this.authRetryTimer) return;
    clearTimeout(this.authRetryTimer);
    this.authRetryTimer = null;
  }

  private setStatus(
    state: SyncStatusState,
    reason: SyncStatusReason = null,
    details: Partial<
      Pick<SyncStatusSnapshot, "attempt" | "retryAt" | "retryDelayMs">
    > = {},
  ): void {
    const nextStatus: SyncStatusSnapshot = {
      state,
      reason,
      attempt:
        details.attempt ?? (state === "connected" ? 0 : this.status.attempt),
      retryAt: details.retryAt ?? null,
      retryDelayMs: details.retryDelayMs ?? null,
    };
    if (
      this.status.state === nextStatus.state &&
      this.status.reason === nextStatus.reason &&
      this.status.attempt === nextStatus.attempt &&
      this.status.retryAt === nextStatus.retryAt &&
      this.status.retryDelayMs === nextStatus.retryDelayMs
    ) {
      return;
    }

    this.status = nextStatus;
    this.statusListeners.forEach((listener) => {
      try {
        listener(this.status);
      } catch {
        errorLog("Sync status listener failed");
      }
    });
  }

  private canConnect(auth: SyncAuthState): boolean {
    return Boolean(auth.isAuthenticated && auth.accessToken);
  }

  private isCurrentLifecycle(lifecycleSequence: number): boolean {
    return this.started && this.lifecycleSequence === lifecycleSequence;
  }

  private isActiveSocket(socket: SyncSocket, socketSequence: number): boolean {
    return (
      this.started &&
      this.socket === socket &&
      this.activeSocketSequence === socketSequence
    );
  }
}

export const syncClient = new SyncClient();
