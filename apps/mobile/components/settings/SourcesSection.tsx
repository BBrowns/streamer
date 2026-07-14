import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import {
  streamEngineManager,
  type BridgeDiagnostics,
  type BridgeStatus,
} from "../../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../../services/streamEngine/bridgeStatusPresentation";
import { diagnosticsFromDesktopBridge } from "../../services/streamEngine/desktopBridgeDiagnostics";
import type { DesktopBridgeInfo } from "../../services/desktop-bridge";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import { AppButton } from "../ui/AppButton";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { TextField } from "../ui/TextField";
import {
  clientBuildMetadata,
  formatBuildLabel,
} from "../../services/buildMetadata";
import {
  createDebugBundle,
  exportDebugBundle,
} from "../../services/debugBundle";
import { getBridgeAuthHeaders } from "../../services/bridgeAuth";
import { formatBytes } from "../downloads/downloadPresentation";
import { preflightBridgeAction } from "../../services/actionPreflight";

function formatBridgeReason(reason: string) {
  switch (reason) {
    case "native-architecture-mismatch":
      return "Native module architecture mismatch";
    case "native-load-failed":
      return "Native torrent module failed to load";
    case "missing-stream-server-build":
      return "Stream bridge build is missing";
    case "bridge-port-owned-by-other-process":
      return "Bridge port is already in use";
    case "invalid-url":
      return "Invalid bridge URL";
    default:
      return reason.replace(/-/g, " ");
  }
}

function formatSelfTestStatus(status: string) {
  switch (status) {
    case "pass":
      return "Passed";
    case "warn":
      return "Warning";
    case "fail":
      return "Failed";
    default:
      return status;
  }
}

function formatRemuxRuntimeStatus(runtime: BridgeDiagnostics["remuxRuntime"]) {
  if (!runtime) return null;
  return runtime.available ? "Available" : "Unavailable";
}

function formatRemuxCacheStatus(cache: BridgeDiagnostics["remuxCache"]) {
  if (!cache) return null;
  return `${cache.entryCount ?? 0} files · ${cache.pendingCount ?? 0} pending`;
}

function formatTorrentCacheStatus(cache: BridgeDiagnostics["torrentCache"]) {
  if (!cache) return null;
  const used = formatBytes(cache.totalBytes ?? 0) ?? "0 B";
  const max = formatBytes(cache.maxBytes ?? 0);
  const usage = max ? `${used} / ${max}` : used;
  return `${cache.entryCount ?? 0} entries · ${usage}`;
}

function formatTorrentCacheCleanupResult(cleanup: {
  removedEntries?: number;
  freedBytes?: number;
}) {
  const removedEntries = cleanup.removedEntries ?? 0;
  const entryLabel = removedEntries === 1 ? "entry" : "entries";
  const freed = formatBytes(cleanup.freedBytes ?? 0) ?? "0 B";
  return `Removed ${removedEntries} inactive cache ${entryLabel} and freed ${freed}.`;
}

type CapabilityTone = "success" | "warning" | "error" | "neutral" | "info";

function SettingsSubheading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.subheading}>
      <Text style={[styles.subheadingTitle, { color: colors.text }]}>
        {title}
      </Text>
      {!!subtitle && (
        <Text
          style={[styles.subheadingSubtitle, { color: colors.textSecondary }]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function CapabilityRow({
  icon,
  title,
  subtitle,
  status,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  status: string;
  tone?: CapabilityTone;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width < 460;

  return (
    <View style={styles.capabilityRow}>
      <View
        style={[styles.iconContainer, { backgroundColor: colors.tint + "20" }]}
      >
        <Ionicons name={icon} size={19} color={colors.tint} />
      </View>
      <View style={styles.capabilityText}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        {isNarrow && (
          <View style={styles.inlineStatus}>
            <StatusPill label={status} tone={tone} />
          </View>
        )}
      </View>
      {!isNarrow && <StatusPill label={status} tone={tone} />}
    </View>
  );
}

export function SourcesSection({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    backendUrl,
    streamServerUrl,
    streamServerToken,
    setServerUrls,
    setStreamServerToken,
  } = useAuthStore();
  const { colors } = useTheme();

  const [tempBackend, setTempBackend] = useState(backendUrl || "");
  const [tempStream, setTempStream] = useState(streamServerUrl || "");
  const [tempStreamToken, setTempStreamToken] = useState(
    streamServerToken || "",
  );
  const [bridgeInfo, setBridgeInfo] = useState<DesktopBridgeInfo | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(
    streamEngineManager.bridgeStatus,
  );
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState<BridgeDiagnostics>(
    streamEngineManager.getBridgeDiagnostics(),
  );
  const [isRestartingBridge, setIsRestartingBridge] = useState(false);
  const [isCleaningTorrentCache, setIsCleaningTorrentCache] = useState(false);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);

  const refreshDesktopBridgeInfo = useCallback(
    async (isCancelled?: () => boolean) => {
      if (Platform.OS !== "web" || !window.desktopBridge?.getBridgeInfo) {
        return null;
      }

      try {
        const info = await window.desktopBridge.getBridgeInfo();
        if (!isCancelled?.()) {
          setBridgeInfo(info);
          if (info.pairingToken) {
            setTempStreamToken(info.pairingToken);
          }
          if (info.lanUrl) {
            setTempStream((current) => current || info.lanUrl);
          }
        }
        return info;
      } catch {
        if (!isCancelled?.()) setBridgeInfo(null);
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const refreshBridge = async () => {
      await refreshDesktopBridgeInfo(() => cancelled);
      await streamEngineManager.detectBridge();
      if (!cancelled) {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      }
    };

    refreshBridge().catch(() => {
      if (!cancelled) {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      }
    });
    const timer = setInterval(() => {
      refreshBridge().catch(() => {
        if (!cancelled) {
          setBridgeStatus(streamEngineManager.bridgeStatus);
          setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
        }
      });
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshDesktopBridgeInfo]);

  const handleSave = async () => {
    setServerUrls(tempBackend.trim() || null, tempStream.trim() || null);
    await setStreamServerToken(tempStreamToken.trim() || null);
    streamEngineManager
      .detectBridge()
      .then(() => {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      })
      .catch(() => {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      });
    hapticSuccess();
    Alert.alert(
      t("settings.advanced.successTitle"),
      t("settings.advanced.successMessage"),
    );
  };

  const handleReset = () => {
    setTempBackend("");
    setTempStream("");
    setTempStreamToken("");
    setServerUrls(null, null);
    void setStreamServerToken(null);
    streamEngineManager
      .detectBridge()
      .then(() => {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      })
      .catch(() => {
        setBridgeStatus(streamEngineManager.bridgeStatus);
        setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      });
    hapticSelection();
  };

  const handleCheckBridge = async () => {
    hapticSelection();
    await refreshDesktopBridgeInfo();
    await streamEngineManager.detectBridge();
    setBridgeStatus(streamEngineManager.bridgeStatus);
    setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
  };

  const handleRecheckRuntime = async () => {
    hapticSelection();
    await refreshDesktopBridgeInfo();
    await streamEngineManager.detectBridge();
    setBridgeStatus(streamEngineManager.bridgeStatus);
    setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
  };

  const handleRestartBridge = async () => {
    if (!window.desktopBridge?.restartBridge) return;

    hapticSelection();
    setIsRestartingBridge(true);
    try {
      const info = await window.desktopBridge.restartBridge();
      setBridgeInfo(info);
      if (info.localUrl) {
        setTempStream(info.localUrl);
      }
      if (info.pairingToken) {
        setTempStreamToken(info.pairingToken);
      }
      await streamEngineManager.detectBridge();
      setBridgeStatus(streamEngineManager.bridgeStatus);
      setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
    } catch {
      setBridgeStatus(streamEngineManager.bridgeStatus);
      setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
    } finally {
      setIsRestartingBridge(false);
    }
  };

  const desktopDiagnostics = diagnosticsFromDesktopBridge(bridgeInfo);
  const effectiveBridgeDiagnostics = desktopDiagnostics || bridgeDiagnostics;
  const effectiveBridgeStatus = desktopDiagnostics?.status || bridgeStatus;
  const bridgePresentation = getBridgeStatusPresentation(
    effectiveBridgeStatus,
    effectiveBridgeDiagnostics,
  );
  const bridgeUrl =
    bridgeInfo?.lanUrl || streamServerUrl || streamEngineManager.getBridgeUrl();
  const torrentPreflight = preflightBridgeAction("play", {
    diagnostics: effectiveBridgeDiagnostics,
    url: bridgeUrl,
    sourceKind: "torrent",
  });
  const downloadPreflight = preflightBridgeAction("download", {
    diagnostics: effectiveBridgeDiagnostics,
    url: bridgeUrl,
    sourceKind: "torrent",
  });
  const castPreflight = preflightBridgeAction("cast", {
    diagnostics: effectiveBridgeDiagnostics,
    url: bridgeUrl,
    sourceKind: "direct",
  });
  const bridgeUrlNeedsLan =
    torrentPreflight.reason === "bridge_loopback_unreachable";
  const bridgeRuntimeLabel =
    effectiveBridgeDiagnostics.platform &&
    effectiveBridgeDiagnostics.processArch
      ? `${effectiveBridgeDiagnostics.platform}/${effectiveBridgeDiagnostics.processArch}`
      : null;

  const bridgeSelfTest = effectiveBridgeDiagnostics.selfTest;
  const bridgeRepair = effectiveBridgeDiagnostics.repair;
  const desktopBuildMetadata =
    bridgeInfo?.build || bridgeInfo?.diagnostics?.build || null;
  const bridgeBuildMetadata = bridgeInfo?.diagnostics?.health?.build || null;
  const remuxRuntime = effectiveBridgeDiagnostics.remuxRuntime;
  const remuxRuntimeStatus = formatRemuxRuntimeStatus(remuxRuntime);
  const remuxCacheStatus = formatRemuxCacheStatus(
    effectiveBridgeDiagnostics.remuxCache,
  );
  const torrentCacheStatus = formatTorrentCacheStatus(
    effectiveBridgeDiagnostics.torrentCache,
  );
  const bridgeRepairSteps = bridgeRepair?.steps ?? [];
  const bridgeRepairTitle = bridgeRepair?.title || "Bridge repair steps";
  const bridgeRepairDetail = bridgeRepair?.detail || bridgePresentation.detail;
  const bridgeReady = torrentPreflight.ready;
  const bridgeNeedsRepair = [
    "bridge_runtime_unsupported",
    "gateway_unavailable",
    "torrent_engine_unavailable",
    "remux_unavailable",
  ].includes(torrentPreflight.reason);
  const bridgeTone: CapabilityTone = bridgeReady
    ? "success"
    : bridgeNeedsRepair
      ? "error"
      : "warning";
  const torrentCapabilityStatus = bridgeReady
    ? "Ready"
    : bridgeNeedsRepair
      ? "Repair"
      : torrentPreflight.reason === "bridge_checking"
        ? "Checking"
        : "Needs bridge";
  const torrentCapabilityTone: CapabilityTone = bridgeReady
    ? "success"
    : bridgeNeedsRepair
      ? "error"
      : "warning";
  const bridgeHeadline = bridgeReady
    ? "Ready to play"
    : bridgeNeedsRepair
      ? "Bridge needs repair"
      : bridgePresentation.title;
  const bridgeSummary = bridgeReady
    ? "Direct streams, compatible torrent playback, downloads, and cast planning can use this setup."
    : bridgeNeedsRepair
      ? "Direct streams can still work, but torrent playback and bridge-backed downloads need repair first."
      : `Direct streams can still work. ${torrentPreflight.message}`;

  const handleShowBridgeRepairSteps = () => {
    const body =
      bridgeRepairSteps.length > 0
        ? `${bridgeRepairDetail}\n\n${bridgeRepairSteps
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n\n")}`
        : bridgeRepairDetail;

    Alert.alert(bridgeRepairTitle, body);
  };

  const handleCopyDiagnostics = async () => {
    setIsCopyingDiagnostics(true);
    try {
      const result = await exportDebugBundle(
        createDebugBundle({
          context: {
            screen: "sources-devices",
            bridgeStatus: effectiveBridgeStatus,
            bridgeReason: effectiveBridgeDiagnostics.reason,
          },
        }),
      );
      Alert.alert(
        "Diagnostics copied",
        result.method === "clipboard"
          ? "A safe debug bundle was copied to the clipboard."
          : "A safe debug bundle was exported.",
      );
    } catch {
      Alert.alert("Diagnostics unavailable", "Could not export diagnostics.");
    } finally {
      setIsCopyingDiagnostics(false);
    }
  };

  const handleCleanTorrentCache = async () => {
    if (!bridgeUrl) return;

    hapticSelection();
    setIsCleaningTorrentCache(true);
    try {
      const res = await fetch(
        `${bridgeUrl.replace(/\/$/, "")}/api/cache/torrent/cleanup`,
        {
          method: "POST",
          headers: getBridgeAuthHeaders(),
        },
      );
      if (!res.ok) {
        throw new Error(`Torrent cache cleanup failed (${res.status})`);
      }

      const data = await res.json();
      await refreshDesktopBridgeInfo();
      await streamEngineManager.detectBridge();
      setBridgeStatus(streamEngineManager.bridgeStatus);
      setBridgeDiagnostics(streamEngineManager.getBridgeDiagnostics());
      hapticSuccess();
      Alert.alert(
        "Torrent cache cleaned",
        formatTorrentCacheCleanupResult(data.cleanup ?? {}),
      );
    } catch {
      Alert.alert(
        "Cache cleanup failed",
        "Could not clean inactive torrent cache entries.",
      );
    } finally {
      setIsCleaningTorrentCache(false);
    }
  };

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t("settings.advanced.title", {
                defaultValue: "Sources & Devices",
              })}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Check whether this device is ready to play, download, and cast.
            </Text>
          </View>
        </View>
      )}

      <Surface
        variant={
          bridgeReady ? "accent" : bridgeNeedsRepair ? "warning" : "default"
        }
        style={styles.readinessCard}
      >
        <View style={styles.bridgeHeader}>
          <StatusPill
            label={bridgePresentation.title}
            tone={bridgeTone}
            icon={
              bridgeTone === "success"
                ? "checkmark-circle-outline"
                : bridgeTone === "error"
                  ? "alert-circle-outline"
                  : "warning-outline"
            }
          />
        </View>
        <Text style={[styles.readinessTitle, { color: colors.text }]}>
          {bridgeHeadline}
        </Text>
        <Text style={[styles.bridgeText, { color: colors.textSecondary }]}>
          {bridgeSummary}
        </Text>
        <View style={styles.actionRow}>
          <AppButton
            label="Check again"
            icon="refresh-outline"
            size="small"
            variant="ghost"
            onPress={handleCheckBridge}
          />
          {Platform.OS === "web" && window.desktopBridge?.getBridgeInfo && (
            <AppButton
              label="Re-check runtime"
              icon="pulse-outline"
              size="small"
              variant="ghost"
              onPress={handleRecheckRuntime}
            />
          )}
          {bridgeRepair?.required && (
            <AppButton
              label="Repair steps"
              icon="build-outline"
              size="small"
              variant="ghost"
              onPress={handleShowBridgeRepairSteps}
            />
          )}
          {bridgeInfo?.lanUrl && (
            <AppButton
              label="Use LAN URL"
              icon="copy-outline"
              size="small"
              variant="ghost"
              onPress={() => {
                setTempStream(bridgeInfo.lanUrl);
                if (bridgeInfo.pairingToken) {
                  setTempStreamToken(bridgeInfo.pairingToken);
                }
                hapticSelection();
              }}
            />
          )}
          {Platform.OS === "web" && window.desktopBridge?.restartBridge && (
            <AppButton
              label={isRestartingBridge ? "Restarting..." : "Restart bridge"}
              icon="reload-outline"
              size="small"
              variant="ghost"
              onPress={handleRestartBridge}
              disabled={isRestartingBridge}
              loading={isRestartingBridge}
            />
          )}
          {!!torrentCacheStatus && (
            <AppButton
              label={isCleaningTorrentCache ? "Cleaning..." : "Clean cache"}
              icon="trash-outline"
              size="small"
              variant="ghost"
              onPress={handleCleanTorrentCache}
              disabled={isCleaningTorrentCache}
              loading={isCleaningTorrentCache}
            />
          )}
          <AppButton
            label={isCopyingDiagnostics ? "Copying..." : "Copy diagnostics"}
            icon="document-text-outline"
            size="small"
            variant="ghost"
            onPress={handleCopyDiagnostics}
            disabled={isCopyingDiagnostics}
            loading={isCopyingDiagnostics}
          />
        </View>
      </Surface>

      {bridgeUrlNeedsLan && (
        <Surface variant="warning" style={styles.warningBox}>
          <Ionicons name="warning-outline" size={16} color="#fbbf24" />
          <View style={styles.warningTextContainer}>
            <Text style={[styles.warningTitle, { color: colors.text }]}>
              Use the desktop bridge LAN URL
            </Text>
            <Text style={styles.warningBodyText}>
              localhost only points at this device. Paste the desktop bridge LAN
              URL before using torrent playback, downloads, or casting here.
            </Text>
          </View>
        </Surface>
      )}

      <SettingsSubheading
        title="Sources & add-ons"
        subtitle="Content sources stay separate from playback devices."
      />
      <Pressable
        onPress={() => {
          hapticSelection();
          router.push("/addons");
        }}
        accessibilityRole="button"
      >
        <Surface variant="accent" style={styles.addonsCard}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(216,180,254,0.14)" },
            ]}
          >
            <Ionicons
              name="extension-puzzle-outline"
              size={20}
              color="#d8b4fe"
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t("settings.items.manageAddons")}
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.manageAddons")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Surface>
      </Pressable>

      <SettingsSubheading
        title="Devices & cast"
        subtitle="Use the desktop app as the local bridge for this network."
      />
      <Surface style={styles.sectionCard}>
        <CapabilityRow
          icon="desktop-outline"
          title="Desktop bridge"
          subtitle={bridgeReady ? bridgeUrl : bridgePresentation.detail}
          status={bridgeReady ? "Connected" : bridgePresentation.badge}
          tone={bridgeTone}
        />
        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
        <CapabilityRow
          icon="radio-outline"
          title="Casting"
          subtitle={
            castPreflight.ready
              ? "Cast uses the configured bridge and the active playback plan."
              : castPreflight.message
          }
          status={castPreflight.ready ? "Ready" : "Limited"}
          tone={castPreflight.ready ? "success" : "warning"}
        />
      </Surface>

      <SettingsSubheading
        title="Playback & downloads"
        subtitle="Normal playback hides source details unless a fallback is needed."
      />
      <Surface style={styles.sectionCard}>
        <CapabilityRow
          icon="play-circle-outline"
          title="Direct streams"
          subtitle="HTTP and supported HLS sources can play without the desktop bridge."
          status="Ready"
          tone="success"
        />
        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
        <CapabilityRow
          icon="magnet-outline"
          title="Torrent streams"
          subtitle={
            torrentPreflight.ready
              ? "Torrents use the desktop bridge for planning, peers, and gateway playback."
              : torrentPreflight.message
          }
          status={torrentCapabilityStatus}
          tone={torrentCapabilityTone}
        />
        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
        <CapabilityRow
          icon="cloud-download-outline"
          title="Downloads"
          subtitle="Offline availability is only shown after a verified local file exists."
          status={downloadPreflight.ready ? "Ready" : "Direct only"}
          tone={downloadPreflight.ready ? "success" : "warning"}
        />
      </Surface>

      <SettingsSubheading
        title="Remote resolvers"
        subtitle="Optional paid services are never required for first-run setup."
      />
      <Surface variant="accent" style={styles.serviceCard}>
        <View style={styles.bridgeHeader}>
          <Ionicons name="diamond-outline" size={16} color={colors.tint} />
          <Text style={[styles.bridgeTitle, { color: colors.text }]}>
            Real-Debrid
          </Text>
        </View>
        <Text style={[styles.bridgeText, { color: colors.textSecondary }]}>
          Optional paid resolver. It is disabled by default and not needed for
          first-run setup.
        </Text>
      </Surface>

      <SettingsSubheading
        title="Advanced"
        subtitle="Connection settings and diagnostics for troubleshooting."
      />
      <Surface style={styles.sectionCard}>
        <Pressable
          style={styles.disclosureRow}
          onPress={() => setShowConnectionSettings((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showConnectionSettings }}
        >
          <View style={styles.textContainerNoMargin}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Connection settings
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: colors.textSecondary }]}
            >
              Server URLs and bridge pairing token.
            </Text>
          </View>
          <Ionicons
            name={showConnectionSettings ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        {showConnectionSettings && (
          <View style={styles.disclosureContent}>
            <TextField
              label={t("settings.advanced.backendLabel")}
              value={tempBackend}
              onChangeText={setTempBackend}
              placeholder="e.g. http://192.168.1.50:3001"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextField
              label={t("settings.advanced.streamLabel")}
              value={tempStream}
              onChangeText={setTempStream}
              placeholder="e.g. http://192.168.1.50:11470"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextField
              label="Bridge pairing token (optional)"
              value={tempStreamToken}
              onChangeText={setTempStreamToken}
              placeholder="Only needed when your bridge requires a token"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            <Surface variant="warning" style={styles.warningBox}>
              <Ionicons name="warning-outline" size={16} color="#fbbf24" />
              <Text style={styles.warningText}>
                {t("settings.advanced.warning")}
              </Text>
            </Surface>

            <View style={styles.footer}>
              <AppButton
                label={t("settings.advanced.restore")}
                onPress={handleReset}
                variant="secondary"
                size="large"
                fullWidth
              />
              <AppButton
                label={t("settings.advanced.apply")}
                onPress={handleSave}
                variant="primary"
                size="large"
                fullWidth
              />
            </View>
          </View>
        )}

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.disclosureRow}
          onPress={() => setShowAdvancedDiagnostics((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvancedDiagnostics }}
        >
          <View style={styles.textContainerNoMargin}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Advanced diagnostics
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: colors.textSecondary }]}
            >
              Build metadata, runtime, native engine, and repair details.
            </Text>
          </View>
          <Ionicons
            name={showAdvancedDiagnostics ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        {showAdvancedDiagnostics && (
          <View style={styles.disclosureContent}>
            <Text
              selectable
              style={[styles.diagnosticsText, { color: colors.textSecondary }]}
            >
              App build: {formatBuildLabel(clientBuildMetadata)}
            </Text>
            {!!desktopBuildMetadata && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Desktop build: {formatBuildLabel(desktopBuildMetadata)}
              </Text>
            )}
            {!!bridgeBuildMetadata && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Bridge build: {formatBuildLabel(bridgeBuildMetadata)}
              </Text>
            )}
            {!!bridgeSelfTest && (
              <>
                <Text
                  selectable
                  style={[
                    styles.diagnosticsText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Self-test: {formatSelfTestStatus(bridgeSelfTest.status)}
                </Text>
                {bridgeSelfTest.checks?.map((check) => (
                  <Text
                    key={check.name}
                    selectable
                    style={[
                      styles.diagnosticsText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {check.name}: {check.message}
                  </Text>
                ))}
              </>
            )}
            {!!effectiveBridgeDiagnostics.reason && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Reason: {formatBridgeReason(effectiveBridgeDiagnostics.reason)}
              </Text>
            )}
            {!!effectiveBridgeDiagnostics.message && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                {effectiveBridgeDiagnostics.message}
              </Text>
            )}
            {!!bridgeRuntimeLabel && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Runtime: {bridgeRuntimeLabel}
                {effectiveBridgeDiagnostics.nativeArch
                  ? ` · Native: ${effectiveBridgeDiagnostics.nativeArch}`
                  : ""}
              </Text>
            )}
            {!!remuxRuntimeStatus && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                FFmpeg: {remuxRuntimeStatus}
              </Text>
            )}
            {!!remuxRuntime?.message && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                {remuxRuntime.message}
              </Text>
            )}
            {!!remuxCacheStatus && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Remux cache: {remuxCacheStatus}
              </Text>
            )}
            {!!torrentCacheStatus && (
              <Text
                selectable
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Torrent cache: {torrentCacheStatus}
              </Text>
            )}
          </View>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.8,
  },
  subheading: {
    gap: 3,
    marginTop: 4,
  },
  subheadingTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  subheadingSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  addonsCard: {
    flexDirection: "row",
    alignItems: "center",
  },
  readinessCard: {
    gap: 10,
  },
  readinessTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  bridgeCard: {
    gap: 10,
  },
  sectionCard: {
    gap: 0,
  },
  capabilityRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
    opacity: 0.7,
  },
  serviceCard: {
    gap: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  capabilityText: {
    flex: 1,
    minWidth: 0,
  },
  textContainerNoMargin: {
    flex: 1,
    minWidth: 0,
  },
  inlineStatus: {
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  bridgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bridgeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  bridgeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bridgeUrlText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    opacity: 0.7,
  },
  diagnosticsBox: {
    gap: 4,
  },
  diagnosticsText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  warningTextContainer: {
    flex: 1,
    gap: 3,
    marginLeft: 10,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  warningBodyText: {
    color: "#fbbf24",
    fontSize: 12,
    lineHeight: 16,
  },
  warningText: {
    color: "#fbbf24",
    fontSize: 12,
    marginLeft: 10,
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  disclosureRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  disclosureContent: {
    gap: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
});
