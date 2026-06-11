import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
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

export function SourcesSection() {
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

  useEffect(() => {
    let cancelled = false;

    const refreshBridge = async () => {
      if (Platform.OS === "web" && window.desktopBridge?.getBridgeInfo) {
        window.desktopBridge
          .getBridgeInfo()
          .then((info) => {
            if (!cancelled) {
              setBridgeInfo(info);
              if (info.pairingToken) {
                setTempStreamToken(info.pairingToken);
              }
            }
          })
          .catch(() => {
            if (!cancelled) setBridgeInfo(null);
          });
      }

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
  }, []);

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
  const bridgeTone =
    bridgePresentation.tone === "success"
      ? "success"
      : bridgePresentation.tone === "error"
        ? "error"
        : "warning";
  const bridgeUrl =
    bridgeInfo?.lanUrl || streamServerUrl || streamEngineManager.getBridgeUrl();
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
  const bridgeRepairSteps = bridgeRepair?.steps ?? [];
  const bridgeRepairTitle = bridgeRepair?.title || "Bridge repair steps";
  const bridgeRepairDetail = bridgeRepair?.detail || bridgePresentation.detail;

  const handleShowBridgeRepairSteps = () => {
    const body =
      bridgeRepairSteps.length > 0
        ? `${bridgeRepairDetail}\n\n${bridgeRepairSteps
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n\n")}`
        : bridgeRepairDetail;

    Alert.alert(bridgeRepairTitle, body);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("settings.advanced.title", {
              defaultValue: "Sources & Devices",
            })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Add-ons, bridge URLs, casting, and optional resolvers
          </Text>
        </View>
      </View>

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

      <Surface style={styles.bridgeCard}>
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
        <Text style={[styles.bridgeText, { color: colors.textSecondary }]}>
          {bridgePresentation.detail}
        </Text>
        <Text style={[styles.bridgeUrlText, { color: colors.textSecondary }]}>
          {bridgeUrl}
        </Text>
        {(effectiveBridgeDiagnostics.reason ||
          bridgeRuntimeLabel ||
          bridgeSelfTest ||
          bridgeRepair?.required) && (
          <Surface style={styles.diagnosticsBox}>
            {!!bridgeSelfTest && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Self-test: {formatSelfTestStatus(bridgeSelfTest.status)}
              </Text>
            )}
            {!!bridgeRepair?.required && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary, marginTop: 4 },
                ]}
              >
                Repair: {bridgeRepair.actionLabel || bridgeRepair.title}
              </Text>
            )}
            {!!effectiveBridgeDiagnostics.reason && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary, marginTop: 4 },
                ]}
              >
                Reason: {formatBridgeReason(effectiveBridgeDiagnostics.reason)}
              </Text>
            )}
            {!!effectiveBridgeDiagnostics.message && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary, marginTop: 4 },
                ]}
              >
                {effectiveBridgeDiagnostics.message}
              </Text>
            )}
            {!!bridgeRuntimeLabel && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary, marginTop: 4 },
                ]}
              >
                Runtime: {bridgeRuntimeLabel}
                {effectiveBridgeDiagnostics.nativeArch
                  ? ` · Native: ${effectiveBridgeDiagnostics.nativeArch}`
                  : ""}
              </Text>
            )}
          </Surface>
        )}
        <View style={styles.actionRow}>
          <AppButton
            label="Check again"
            icon="refresh-outline"
            size="small"
            variant="ghost"
            onPress={handleCheckBridge}
          />
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
        </View>
      </Surface>

      <Surface style={styles.diagnosticsBox}>
        <Text style={[styles.diagnosticsText, { color: colors.textSecondary }]}>
          App build: {formatBuildLabel(clientBuildMetadata)}
        </Text>
        {!!desktopBuildMetadata && (
          <Text
            style={[
              styles.diagnosticsText,
              { color: colors.textSecondary, marginTop: 4 },
            ]}
          >
            Desktop build: {formatBuildLabel(desktopBuildMetadata)}
          </Text>
        )}
        {!!bridgeBuildMetadata && (
          <Text
            style={[
              styles.diagnosticsText,
              { color: colors.textSecondary, marginTop: 4 },
            ]}
          >
            Bridge build: {formatBuildLabel(bridgeBuildMetadata)}
          </Text>
        )}
      </Surface>

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
        <Text style={styles.warningText}>{t("settings.advanced.warning")}</Text>
      </Surface>

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
  addonsCard: {
    flexDirection: "row",
    alignItems: "center",
  },
  bridgeCard: {
    gap: 10,
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
});
