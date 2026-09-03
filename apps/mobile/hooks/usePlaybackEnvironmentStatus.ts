import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SetStateAction,
} from "react";
import { Alert, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import {
  streamEngineManager,
  type BridgeDiagnostics,
} from "../services/streamEngine/StreamEngineManager";
import {
  getBridgeReadinessSnapshot,
  refreshBridgeReadiness,
  subscribeBridgeReadiness,
} from "../services/streamEngine/bridgeReadinessRuntime";
import { getBridgeStatusPresentation } from "../services/streamEngine/bridgeStatusPresentation";
import { diagnosticsFromDesktopBridge } from "../services/streamEngine/desktopBridgeDiagnostics";
import { preflightBridgeAction } from "../services/actionPreflight";
import { getBridgeAuthHeaders } from "../services/bridgeAuth";
import { createDebugBundle, exportDebugBundle } from "../services/debugBundle";
import { hapticSelection, hapticSuccess } from "../lib/haptics";
import { formatBytes } from "../components/downloads/downloadPresentation";

function formatCacheCleanupResult(
  cleanup: {
    removedEntries?: number;
    freedBytes?: number;
  },
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const removedEntries = cleanup.removedEntries ?? 0;
  const entryLabel = removedEntries === 1 ? "entry" : "entries";
  const freed = formatBytes(cleanup.freedBytes ?? 0) ?? "0 B";
  return t("settings.advancedSection.cacheCleanupResult", {
    count: removedEntries,
    size: freed,
    defaultValue: `Removed ${removedEntries} inactive cache ${entryLabel} and freed ${freed}.`,
  });
}

function getTorrentCacheLabel(
  cache: BridgeDiagnostics["torrentCache"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!cache) return null;
  const used = formatBytes(cache.totalBytes ?? 0) ?? "0 B";
  const max = formatBytes(cache.maxBytes ?? 0);
  const count = cache.entryCount ?? 0;
  return t("settings.advancedSection.torrentCacheUsage", {
    count,
    usage: max ? `${used} / ${max}` : used,
    defaultValue: `${count} entries · ${max ? `${used} / ${max}` : used}`,
  });
}

export function usePlaybackEnvironmentStatus() {
  const { t } = useTranslation();
  const {
    backendUrl,
    streamServerUrl,
    streamServerToken,
    credentialsHydrated,
    setServerUrls,
    setStreamServerToken,
  } = useAuthStore();
  const [backendInput, setBackendInputState] = useState(backendUrl || "");
  const [streamInput, setStreamInputState] = useState(streamServerUrl || "");
  const [pairingTokenInput, setPairingTokenInputState] = useState(
    streamServerToken || "",
  );
  const backendInputDirty = useRef(false);
  const streamInputDirty = useRef(false);
  const pairingTokenInputDirty = useRef(false);
  const readiness = useSyncExternalStore(
    subscribeBridgeReadiness,
    getBridgeReadinessSnapshot,
    getBridgeReadinessSnapshot,
  );
  const { bridgeInfo, bridgeStatus, bridgeDiagnostics } = readiness;
  const [isRestarting, setIsRestarting] = useState(false);
  const [isCleaningCache, setIsCleaningCache] = useState(false);
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const setBackendInput = useCallback((value: SetStateAction<string>) => {
    backendInputDirty.current = true;
    setBackendInputState(value);
  }, []);
  const setStreamInput = useCallback((value: SetStateAction<string>) => {
    streamInputDirty.current = true;
    setStreamInputState(value);
  }, []);
  const setPairingTokenInput = useCallback((value: SetStateAction<string>) => {
    pairingTokenInputDirty.current = true;
    setPairingTokenInputState(value);
  }, []);

  useEffect(() => {
    if (!credentialsHydrated) return;

    if (!backendInputDirty.current) {
      setBackendInputState(backendUrl || "");
    }
    if (!streamInputDirty.current) {
      setStreamInputState(streamServerUrl || "");
    }
    if (!pairingTokenInputDirty.current) {
      setPairingTokenInputState(streamServerToken || "");
    }
  }, [backendUrl, credentialsHydrated, streamServerToken, streamServerUrl]);

  const refreshEnvironment = useCallback(async (withProgress = false) => {
    if (withProgress) setIsChecking(true);
    try {
      const refreshed = await refreshBridgeReadiness();
      const lanUrl = refreshed.bridgeInfo?.lanUrl;
      if (lanUrl && !streamInputDirty.current) {
        setStreamInputState((current) => current || lanUrl);
      }
    } finally {
      if (withProgress) setIsChecking(false);
    }
  }, []);

  const derived = useMemo(() => {
    const desktopDiagnostics = diagnosticsFromDesktopBridge(bridgeInfo);
    const effectiveDiagnostics = desktopDiagnostics || bridgeDiagnostics;
    const effectiveStatus = desktopDiagnostics?.status || bridgeStatus;
    const presentation = getBridgeStatusPresentation(
      effectiveStatus,
      effectiveDiagnostics,
    );
    const bridgeUrl =
      bridgeInfo?.lanUrl ||
      streamServerUrl ||
      streamEngineManager.getBridgeUrl();
    const torrentPreflight = preflightBridgeAction("play", {
      diagnostics: effectiveDiagnostics,
      url: bridgeUrl,
      sourceKind: "torrent",
    });
    const downloadPreflight = preflightBridgeAction("download", {
      diagnostics: effectiveDiagnostics,
      url: bridgeUrl,
      sourceKind: "torrent",
    });
    const castPreflight = preflightBridgeAction("cast", {
      diagnostics: effectiveDiagnostics,
      url: bridgeUrl,
      sourceKind: "direct",
    });
    const bridgeReady = torrentPreflight.ready;
    const bridgeNeedsRepair = [
      "bridge_runtime_unsupported",
      "gateway_unavailable",
      "torrent_engine_unavailable",
      "remux_unavailable",
    ].includes(torrentPreflight.reason);

    return {
      effectiveDiagnostics,
      effectiveStatus,
      presentation,
      bridgeUrl,
      torrentPreflight,
      downloadPreflight,
      castPreflight,
      bridgeReady,
      bridgeNeedsRepair,
      bridgeUrlNeedsLan:
        torrentPreflight.reason === "bridge_loopback_unreachable",
      repair: effectiveDiagnostics.repair,
      torrentCacheLabel: getTorrentCacheLabel(
        effectiveDiagnostics.torrentCache,
        t,
      ),
    };
  }, [bridgeDiagnostics, bridgeInfo, bridgeStatus, streamServerUrl, t]);

  const saveConnections = useCallback(async () => {
    setServerUrls(backendInput.trim() || null, streamInput.trim() || null);
    await setStreamServerToken(pairingTokenInput.trim() || null);
    backendInputDirty.current = false;
    streamInputDirty.current = false;
    pairingTokenInputDirty.current = false;
    await refreshEnvironment();
    hapticSuccess();
    Alert.alert(
      t("settings.advanced.successTitle"),
      t("settings.advanced.successMessage"),
    );
  }, [
    backendInput,
    pairingTokenInput,
    refreshEnvironment,
    setServerUrls,
    setStreamServerToken,
    streamInput,
    t,
  ]);

  const resetConnections = useCallback(() => {
    backendInputDirty.current = false;
    streamInputDirty.current = false;
    pairingTokenInputDirty.current = false;
    setBackendInputState("");
    setStreamInputState("");
    setPairingTokenInputState("");
    setServerUrls(null, null);
    void setStreamServerToken(null);
    hapticSelection();
    void refreshEnvironment().catch(() => undefined);
  }, [refreshEnvironment, setServerUrls, setStreamServerToken]);

  const restartService = useCallback(async () => {
    if (typeof window === "undefined" || !window.desktopBridge?.restartBridge) {
      return;
    }

    hapticSelection();
    setIsRestarting(true);
    try {
      const info = await window.desktopBridge.restartBridge();
      if (info.localUrl) setStreamInputState(info.localUrl);
      await refreshBridgeReadiness();
    } finally {
      setIsRestarting(false);
    }
  }, []);

  const showRepairSteps = useCallback(() => {
    const repair = derived.repair;
    const detail = repair?.detail || derived.presentation.detail;
    const steps = repair?.steps ?? [];
    const body =
      steps.length > 0
        ? `${detail}\n\n${steps
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n\n")}`
        : detail;
    Alert.alert(
      repair?.title ||
        t("settings.advancedSection.repairSteps", {
          defaultValue: "Repair steps",
        }),
      body,
    );
  }, [derived.presentation.detail, derived.repair, t]);

  const cleanCache = useCallback(async () => {
    if (!derived.bridgeUrl) return;
    hapticSelection();
    setIsCleaningCache(true);
    try {
      const response = await fetch(
        `${derived.bridgeUrl.replace(/\/$/, "")}/api/cache/torrent/cleanup`,
        { method: "POST", headers: getBridgeAuthHeaders() },
      );
      if (!response.ok) {
        throw new Error(`Torrent cache cleanup failed (${response.status})`);
      }
      const data = await response.json();
      await refreshEnvironment();
      hapticSuccess();
      Alert.alert(
        t("settings.advancedSection.cacheCleaned", {
          defaultValue: "Playback cache cleaned",
        }),
        formatCacheCleanupResult(data.cleanup ?? {}, t),
      );
    } catch {
      Alert.alert(
        t("settings.advancedSection.cacheCleanupFailed"),
        t("settings.advancedSection.cacheCleanupFailedDescription"),
      );
    } finally {
      setIsCleaningCache(false);
    }
  }, [derived.bridgeUrl, refreshEnvironment, t]);

  const exportDiagnostics = useCallback(async () => {
    setIsExportingDiagnostics(true);
    try {
      const result = await exportDebugBundle(
        createDebugBundle({
          context: {
            screen: "settings-advanced",
            bridgeStatus: derived.effectiveStatus,
            bridgeReason: derived.effectiveDiagnostics.reason,
          },
        }),
      );
      Alert.alert(
        t("settings.advancedSection.diagnosticsExported"),
        result.method === "clipboard"
          ? t("settings.advancedSection.diagnosticsCopiedDescription")
          : t("settings.advancedSection.diagnosticsExportedDescription"),
      );
    } catch {
      Alert.alert(
        t("settings.advancedSection.diagnosticsUnavailable"),
        t("settings.advancedSection.diagnosticsUnavailableDescription"),
      );
    } finally {
      setIsExportingDiagnostics(false);
    }
  }, [derived.effectiveDiagnostics.reason, derived.effectiveStatus, t]);

  return {
    ...derived,
    bridgeInfo,
    backendInput,
    setBackendInput,
    streamInput,
    setStreamInput,
    pairingTokenInput,
    setPairingTokenInput,
    isChecking,
    isRestarting,
    isCleaningCache,
    isExportingDiagnostics,
    canRestart:
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      Boolean(window.desktopBridge?.restartBridge),
    refreshEnvironment: () => refreshEnvironment(true),
    saveConnections,
    resetConnections,
    restartService,
    showRepairSteps,
    cleanCache,
    exportDiagnostics,
  };
}
