import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import {
  streamEngineManager,
  type BridgeDiagnostics,
  type BridgeStatus,
} from "../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../services/streamEngine/bridgeStatusPresentation";
import { diagnosticsFromDesktopBridge } from "../services/streamEngine/desktopBridgeDiagnostics";
import type { DesktopBridgeInfo } from "../services/desktop-bridge";
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
    setServerUrls,
    setStreamServerToken,
  } = useAuthStore();
  const [backendInput, setBackendInput] = useState(backendUrl || "");
  const [streamInput, setStreamInput] = useState(streamServerUrl || "");
  const [pairingTokenInput, setPairingTokenInput] = useState(
    streamServerToken || "",
  );
  const [bridgeInfo, setBridgeInfo] = useState<DesktopBridgeInfo | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(
    streamEngineManager.bridgeStatus,
  );
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState<BridgeDiagnostics>(
    streamEngineManager.getBridgeDiagnostics(),
  );
  const [isRestarting, setIsRestarting] = useState(false);
  const [isCleaningCache, setIsCleaningCache] = useState(false);
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const refreshDesktopInfo = useCallback(
    async (isCancelled?: () => boolean) => {
      if (
        Platform.OS !== "web" ||
        typeof window === "undefined" ||
        !window.desktopBridge?.getBridgeInfo
      ) {
        return null;
      }

      try {
        const info = await window.desktopBridge.getBridgeInfo();
        if (!isCancelled?.()) {
          setBridgeInfo(info);
          if (info.pairingToken) setPairingTokenInput(info.pairingToken);
          if (info.lanUrl) setStreamInput((current) => current || info.lanUrl);
        }
        return info;
      } catch {
        if (!isCancelled?.()) setBridgeInfo(null);
        return null;
      }
    },
    [],
  );

  const syncDiagnostics = useCallback(() => {
    setBridgeStatus(streamEngineManager.bridgeStatus);
    setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
  }, []);

  const refreshEnvironment = useCallback(
    async (withProgress = false, isCancelled?: () => boolean) => {
      if (withProgress) setIsChecking(true);
      try {
        await refreshDesktopInfo(isCancelled);
        await streamEngineManager.detectBridge();
      } finally {
        if (!isCancelled?.()) syncDiagnostics();
        if (withProgress) setIsChecking(false);
      }
    },
    [refreshDesktopInfo, syncDiagnostics],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void refreshEnvironment(false, isCancelled).catch(() => undefined);
    const timer = setInterval(() => {
      void refreshEnvironment(false, isCancelled).catch(() => undefined);
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshEnvironment]);

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
    setBackendInput("");
    setStreamInput("");
    setPairingTokenInput("");
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
      setBridgeInfo(info);
      if (info.localUrl) setStreamInput(info.localUrl);
      if (info.pairingToken) setPairingTokenInput(info.pairingToken);
      await streamEngineManager.detectBridge();
    } finally {
      syncDiagnostics();
      setIsRestarting(false);
    }
  }, [syncDiagnostics]);

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
