import { Platform } from "react-native";
import type { BridgeNetworkProbeResponseV1 } from "@streamer/shared";
import type { DesktopBridgeInfo } from "../desktop-bridge";
import {
  getBridgeAuthHeaders,
  setDesktopBridgeAccessSession,
} from "../bridgeAuth";
import { useAuthStore } from "../../stores/authStore";
import { streamEngineManager } from "./StreamEngineManager";
import { getBridgeClient } from "../bridge/BridgeClient";
import {
  getNetworkContextHint,
  type NetworkContextHint,
} from "./networkContext";

export interface BridgeReadinessSnapshot {
  bridgeInfo: Omit<DesktopBridgeInfo, "accessSession"> | null;
  bridgeAvailable: boolean;
  bridgeStatus: typeof streamEngineManager.bridgeStatus;
  bridgeDiagnostics: ReturnType<
    typeof streamEngineManager.getBridgeDiagnostics
  >;
  torrentNetworkProbe: TorrentNetworkProbeSnapshot;
  networkContext: NetworkContextHint;
  refreshing: boolean;
}

export interface TorrentNetworkProbeSnapshot {
  status: BridgeNetworkProbeResponseV1["status"];
  phase?: BridgeNetworkProbeResponseV1["phase"];
  probeId?: string;
  peerCount?: number;
  failureCode?: BridgeNetworkProbeResponseV1["failureCode"];
  checkedAt?: number;
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
let torrentNetworkProbe: TorrentNetworkProbeSnapshot = { status: "unknown" };
let networkContext: NetworkContextHint = { kind: "unknown", online: null };
let networkProbeInFlight: {
  promise: Promise<BridgeReadinessSnapshot>;
  controller: AbortController;
} | null = null;
let snapshot: BridgeReadinessSnapshot = createSnapshot(null);
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function createSnapshot(
  bridgeInfo: BridgeReadinessSnapshot["bridgeInfo"],
): BridgeReadinessSnapshot {
  const bridgeSnapshot = streamEngineManager.getBridgeSnapshot();
  const bridgeAuthRequired = bridgeSnapshot.diagnostics.auth?.required === true;
  const hasDesktopBridge =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    Boolean(window.desktopBridge);
  const credentialReady =
    Platform.OS !== "web" ||
    (!hasDesktopBridge && !bridgeAuthRequired) ||
    Boolean(getBridgeAuthHeaders().Authorization);
  return {
    bridgeInfo,
    bridgeAvailable: bridgeSnapshot.available && credentialReady,
    bridgeStatus: bridgeSnapshot.status,
    bridgeDiagnostics: bridgeSnapshot.diagnostics,
    torrentNetworkProbe,
    networkContext,
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
    networkProbeInFlight?.controller.abort();
    networkProbeInFlight = null;
    torrentNetworkProbe = { status: "unknown" };
    networkContext = { kind: "unknown", online: null };
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
      const [info, , context] = await Promise.all([
        readDesktopBridgeInfo(controller.signal),
        streamEngineManager.detectBridge(),
        getNetworkContextHint(),
      ]);
      if (generation !== currentGeneration || controller.signal.aborted)
        throw createAbortError();
      let bridgeInfo: BridgeReadinessSnapshot["bridgeInfo"] = null;
      if (info) {
        const { accessSession, ...metadata } = info;
        setDesktopBridgeAccessSession(accessSession);
        bridgeInfo = metadata;
      }
      networkContext = context;
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

function setTorrentNetworkProbe(result: TorrentNetworkProbeSnapshot) {
  torrentNetworkProbe = result;
  publish();
  return snapshot;
}

function unknownTorrentNetworkProbe() {
  return setTorrentNetworkProbe({ status: "unknown", checkedAt: Date.now() });
}

/**
 * Runs the bridge-owned torrent transport canary. This is deliberately kept
 * separate from ordinary bridge health: a healthy HTTP bridge does not prove
 * that tracker, peer, metadata, or first-byte traffic is usable.
 */
export function ensureTorrentNetworkReadiness({
  signal,
  force = false,
}: { signal?: AbortSignal; force?: boolean } = {}) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (networkProbeInFlight) {
    return awaitWithAbort(networkProbeInFlight.promise, signal);
  }

  const checkedAt = torrentNetworkProbe.checkedAt ?? 0;
  if (!force && checkedAt > 0 && Date.now() - checkedAt < 10 * 60_000) {
    return Promise.resolve(snapshot);
  }

  const currentGeneration = generation;
  const controller = new AbortController();
  const probe = Promise.resolve()
    .then(async () => {
      const ready = await ensureBridgeReadiness();
      if (
        currentGeneration !== generation ||
        controller.signal.aborted ||
        !ready.bridgeAvailable
      ) {
        return unknownTorrentNetworkProbe();
      }

      const bridgeUrl = streamEngineManager.getBridgeUrl();
      if (!bridgeUrl) return unknownTorrentNetworkProbe();

      const client = getBridgeClient(bridgeUrl);
      let capabilities;
      try {
        capabilities = await client.getCapabilities(controller.signal);
      } catch {
        return unknownTorrentNetworkProbe();
      }

      if (!capabilities.capabilities.diagnostics?.torrentNetworkProbe) {
        return unknownTorrentNetworkProbe();
      }

      let result: BridgeNetworkProbeResponseV1;
      try {
        result = await client.probeTorrentNetwork(controller.signal);
      } catch {
        return setTorrentNetworkProbe({
          status: "degraded",
          phase: "bridge",
          failureCode: "BRIDGE_UNAVAILABLE",
          checkedAt: Date.now(),
        });
      }

      if (currentGeneration !== generation || controller.signal.aborted) {
        throw createAbortError();
      }

      return setTorrentNetworkProbe({
        status: result.status,
        phase: result.phase,
        probeId: result.probeId,
        peerCount: result.peerCount,
        failureCode: result.failureCode,
        checkedAt: Date.now(),
      });
    })
    .finally(() => {
      if (networkProbeInFlight?.promise === probe) {
        networkProbeInFlight = null;
        publish();
      }
    });

  networkProbeInFlight = { promise: probe, controller };
  publish();
  return awaitWithAbort(probe, signal);
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
  refreshInFlight?.controller.abort();
  networkProbeInFlight?.controller.abort();
  refreshInFlight = null;
  networkProbeInFlight = null;
  streamEngineManager.invalidateBridge();
  torrentNetworkProbe = { status: "unknown" };
  networkContext = { kind: "unknown", online: null };
  snapshot = createSnapshot(null);
  listeners.clear();
}
