import { Platform } from "react-native";
import type { DesktopBridgeInfo } from "../desktop-bridge";
import { setDesktopBridgeAccessSession } from "../bridgeAuth";
import { streamEngineManager } from "./StreamEngineManager";

export interface BridgeReadinessSnapshot {
  bridgeInfo: DesktopBridgeInfo | null;
  bridgeAvailable: boolean;
  bridgeStatus: typeof streamEngineManager.bridgeStatus;
  bridgeDiagnostics: ReturnType<
    typeof streamEngineManager.getBridgeDiagnostics
  >;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: BridgeReadinessSnapshot = createSnapshot(null);
let refreshInFlight: Promise<BridgeReadinessSnapshot> | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function createSnapshot(
  bridgeInfo: DesktopBridgeInfo | null,
): BridgeReadinessSnapshot {
  const bridgeSnapshot = streamEngineManager.getBridgeSnapshot();
  return {
    bridgeInfo,
    bridgeAvailable: bridgeSnapshot.available,
    bridgeStatus: bridgeSnapshot.status,
    bridgeDiagnostics: bridgeSnapshot.diagnostics,
  };
}

function publish(bridgeInfo = snapshot.bridgeInfo) {
  snapshot = createSnapshot(bridgeInfo);
  for (const listener of listeners) listener();
}

streamEngineManager.subscribeBridge(() => publish());

export function subscribeBridgeReadiness(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBridgeReadinessSnapshot() {
  return snapshot;
}

async function readDesktopBridgeInfo(): Promise<DesktopBridgeInfo | null> {
  if (
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    !window.desktopBridge?.getBridgeInfo
  ) {
    return null;
  }

  try {
    const info = await window.desktopBridge.getBridgeInfo();
    setDesktopBridgeAccessSession(info.accessSession);
    return info;
  } catch {
    return null;
  }
}

/**
 * Refreshes the desktop bridge metadata and health probe as one shared
 * operation. Callers never receive or persist the bridge credential itself.
 */
export function refreshBridgeReadiness() {
  if (refreshInFlight) return refreshInFlight;

  const refresh = (async () => {
    const bridgeInfo = await readDesktopBridgeInfo();
    await streamEngineManager.detectBridge();
    publish(bridgeInfo);
    return snapshot;
  })();

  refreshInFlight = refresh;
  void refresh.then(
    () => {
      if (refreshInFlight === refresh) refreshInFlight = null;
    },
    () => {
      if (refreshInFlight === refresh) refreshInFlight = null;
    },
  );
  return refresh;
}

export function startBridgeReadinessPolling(intervalMs = 8000) {
  if (pollingTimer) return;

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
  refreshInFlight = null;
  snapshot = createSnapshot(null);
  listeners.clear();
}
