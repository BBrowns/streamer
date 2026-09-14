import { Platform } from "react-native";
import type { DesktopBridgeInfo } from "../desktop-bridge";
import {
  getBridgeAuthHeaders,
  setDesktopBridgeAccessSession,
} from "../bridgeAuth";
import { useAuthStore } from "../../stores/authStore";
import { streamEngineManager } from "./StreamEngineManager";

export interface BridgeReadinessSnapshot {
  bridgeInfo: Omit<DesktopBridgeInfo, "accessSession"> | null;
  bridgeAvailable: boolean;
  bridgeStatus: typeof streamEngineManager.bridgeStatus;
  bridgeDiagnostics: ReturnType<
    typeof streamEngineManager.getBridgeDiagnostics
  >;
  refreshing: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let refreshInFlight: {
  promise: Promise<BridgeReadinessSnapshot>;
  controller: AbortController;
} | null = null;
let generation = streamEngineManager.getBridgeSnapshot().generation;
let confirmedGeneration: number | null = null;
let confirmedAt = 0;
let snapshot: BridgeReadinessSnapshot = createSnapshot(null);
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function createSnapshot(
  bridgeInfo: BridgeReadinessSnapshot["bridgeInfo"],
): BridgeReadinessSnapshot {
  const bridgeSnapshot = streamEngineManager.getBridgeSnapshot();
  const credentialReady =
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    !window.desktopBridge ||
    Boolean(getBridgeAuthHeaders().Authorization);
  return {
    bridgeInfo,
    bridgeAvailable: bridgeSnapshot.available && credentialReady,
    bridgeStatus: bridgeSnapshot.status,
    bridgeDiagnostics: bridgeSnapshot.diagnostics,
    refreshing: Boolean(refreshInFlight) || bridgeSnapshot.refreshing,
  };
}

function publish(bridgeInfo = snapshot.bridgeInfo) {
  const next = createSnapshot(bridgeInfo);
  const meaningful = (value: BridgeReadinessSnapshot) =>
    JSON.stringify(value, (key, entry) =>
      key === "checkedAt" || key === "updatedAt" ? undefined : entry,
    );
  if (meaningful(next) === meaningful(snapshot)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

streamEngineManager.subscribeBridge(() => {
  const nextGeneration = streamEngineManager.getBridgeSnapshot().generation;
  if (generation !== nextGeneration) {
    generation = nextGeneration;
    confirmedGeneration = null;
    confirmedAt = 0;
    refreshInFlight?.controller.abort();
    refreshInFlight = null;
    setDesktopBridgeAccessSession(null);
    publish(null);
  } else if (!refreshInFlight) {
    publish();
  }
});

function authReady() {
  const state = useAuthStore.getState();
  return state.isHydrated && state.credentialsHydrated && state.isAuthenticated;
}

useAuthStore.subscribe(() => {
  if (!authReady()) stopBridgeReadinessPolling();
});

export function subscribeBridgeReadiness(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBridgeReadinessSnapshot() {
  return snapshot;
}

async function readDesktopBridgeInfo(
  signal: AbortSignal,
): Promise<DesktopBridgeInfo | null> {
  if (
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    !window.desktopBridge?.getBridgeInfo
  ) {
    return null;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Metadata runs alongside health and gets no more than one existing probe
    // budget. A late IPC result must never install an old renderer credential.
    return await awaitWithAbort(
      Promise.race([
        window.desktopBridge.getBridgeInfo(),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 1500);
        }),
      ]),
      signal,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Refreshes the desktop bridge metadata and health probe as one shared
 * operation. Callers never receive or persist the bridge credential itself.
 */
export function refreshBridgeReadiness() {
  if (refreshInFlight) return refreshInFlight.promise;
  if (!authReady()) return Promise.resolve(snapshot);

  const currentGeneration = generation;
  const controller = new AbortController();
  const refresh = awaitWithAbort(
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw createAbortError();
      const [info] = await Promise.all([
        readDesktopBridgeInfo(controller.signal),
        streamEngineManager.detectBridge(),
      ]);
      if (generation !== currentGeneration || controller.signal.aborted)
        throw createAbortError();
      let bridgeInfo: BridgeReadinessSnapshot["bridgeInfo"] = null;
      if (info) {
        const { accessSession, ...metadata } = info;
        setDesktopBridgeAccessSession(accessSession);
        bridgeInfo = metadata;
      }
      confirmedGeneration = currentGeneration;
      confirmedAt = Date.now();
      refreshInFlight = null;
      publish(bridgeInfo);
      return snapshot;
    }),
    controller.signal,
  );

  refreshInFlight = { promise: refresh, controller };
  publish();
  const cleanup = () => {
    if (refreshInFlight?.promise === refresh) {
      refreshInFlight = null;
      publish();
    }
  };
  void refresh.then(cleanup, cleanup);
  return refresh;
}

/**
 * Wait for initial readiness only. A refresh retains the last confirmation for
 * this configuration, including real failures. Cancelling a caller detaches
 * that waiter; configuration invalidation owns cancellation of shared probes.
 * Call only for a source/action that actually depends on the bridge.
 */
export function ensureBridgeReadiness({
  signal,
}: { signal?: AbortSignal } = {}): Promise<BridgeReadinessSnapshot> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  const readiness =
    confirmedGeneration === generation &&
    snapshot.bridgeStatus !== "loading" &&
    (Boolean(refreshInFlight) || Date.now() - confirmedAt < 8000)
      ? Promise.resolve(snapshot)
      : refreshBridgeReadiness();
  return awaitWithAbort(readiness, signal);
}

function createAbortError() {
  const error = new Error("Bridge readiness wait cancelled");
  error.name = "AbortError";
  return error;
}

function awaitWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function startBridgeReadinessPolling(intervalMs = 8000) {
  if (pollingTimer || !authReady()) return;

  void refreshBridgeReadiness().catch(() => undefined);
  pollingTimer = setInterval(() => {
    void refreshBridgeReadiness().catch(() => undefined);
  }, intervalMs);
}

export function stopBridgeReadinessPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
}

export function __resetBridgeReadinessRuntimeForTests() {
  stopBridgeReadinessPolling();
  streamEngineManager.invalidateBridge();
  snapshot = createSnapshot(null);
  listeners.clear();
}
