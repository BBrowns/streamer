import { Platform } from "react-native";
import { createSyncWebSocketProtocols } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";
import { BASE_URL, refreshAuthSession } from "./api";

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;
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

type SyncSocket = WebSocket;
type SyncListener = (message: SyncMessage) => void;
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

  log("Connecting to", wsUrl);

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

export class SyncClient {
  private readonly getAuth: () => SyncAuthState;
  private readonly createSocket: (
    accessToken: string,
    deviceId: string | null,
  ) => SyncSocket;
  private readonly refreshAuth: () => Promise<string>;
  private readonly now: () => number;
  private readonly listeners = new Set<SyncListener>();

  private started = false;
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

  constructor(options: SyncClientOptions = {}) {
    this.getAuth = options.getAuth ?? getDefaultAuth;
    this.createSocket = options.createSocket ?? createDefaultSocket;
    this.refreshAuth = options.refreshAuth ?? refreshAuthSession;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.connectIfNeeded();
  }

  updateAuth(): void {
    const auth = this.getAuth();
    if (!auth.isAuthenticated || !auth.accessToken) {
      this.stop();
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
    this.closeSocket();
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendMessage(event: string, data: unknown): void {
    if (!this.socket || this.socket.readyState !== 1) {
      warn("Cannot send message: WebSocket is not open", event);
      return;
    }

    try {
      this.socket.send(JSON.stringify({ event, data }));
    } catch {
      warn("Failed to send WebSocket message", event);
    }
  }

  private async connectIfNeeded(): Promise<void> {
    if (
      !this.started ||
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
      } catch {
        warn("Sync authentication refresh failed");
        if (this.isCurrentLifecycle(lifecycleSequence)) this.stop();
        return;
      }
    }

    if (!this.isCurrentLifecycle(lifecycleSequence) || !this.canConnect(auth)) {
      return;
    }

    this.openSocket(auth.accessToken as string, auth.deviceId);
  }

  private openSocket(accessToken: string, deviceId: string | null): void {
    if (!this.started || this.socket) return;

    let socket: SyncSocket;
    try {
      socket = this.createSocket(accessToken, deviceId);
    } catch {
      errorLog("Failed to create WebSocket");
      this.scheduleRetry();
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

    socket.onerror = (event: unknown) => {
      if (!this.isActiveSocket(socket, socketSequence)) return;
      const message =
        event && typeof event === "object" && "message" in event
          ? (event as { message?: unknown }).message
          : undefined;
      warn("Connection error:", message || "Unknown error");
    };

    socket.onclose = (event) => {
      if (!this.isActiveSocket(socket, socketSequence)) return;

      log("Connection closed:", event.code, event.reason);
      this.socket = null;
      this.socketDeviceId = null;
      this.activeSocketSequence = 0;
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (!this.started || this.retryTimer || this.socket) return;

    const delay =
      RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)];
    this.retryCount += 1;
    log(`Reconnecting in ${delay / 1000}s (attempt ${this.retryCount})…`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
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
      return;
    }

    try {
      await this.refreshAuth();
      if (this.started) this.scheduleTokenRefresh();
    } catch {
      warn("Sync authentication refresh failed");
      this.stop();
    }
  }

  private restartForDevice(): void {
    log("Restarting Sync connection after device change");
    this.lifecycleSequence += 1;
    this.retryCount = 0;
    this.clearRetryTimer();
    this.clearTokenRefreshTimer();
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
