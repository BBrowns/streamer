import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
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
import type { DesktopBridgeInfo } from "../../services/desktop-bridge";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";

function formatBridgeReason(reason: string) {
  switch (reason) {
    case "native-architecture-mismatch":
      return "Native module architecture mismatch";
    case "native-load-failed":
      return "Native torrent module failed to load";
    case "invalid-url":
      return "Invalid bridge URL";
    default:
      return reason.replace(/-/g, " ");
  }
}

function diagnosticsFromDesktopBridge(
  info: DesktopBridgeInfo | null,
): BridgeDiagnostics | null {
  const diagnostics = info?.diagnostics;
  if (!diagnostics) return null;

  return {
    status:
      diagnostics.status === "error"
        ? "unsupported"
        : diagnostics.status === "starting"
          ? "loading"
          : "unreachable",
    url: info?.localUrl || info?.lanUrl,
    reason: diagnostics.reason || undefined,
    message: diagnostics.message || diagnostics.error || undefined,
    processArch: diagnostics.processArch || diagnostics.nodeArch || undefined,
    platform: diagnostics.platform,
    checkedAt: diagnostics.updatedAt,
  };
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
  const { colors, isDark } = useTheme();

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
  const effectiveBridgeDiagnostics =
    bridgeStatus === "unreachable" && desktopDiagnostics
      ? desktopDiagnostics
      : bridgeDiagnostics;
  const effectiveBridgeStatus =
    bridgeStatus === "unreachable" && desktopDiagnostics
      ? desktopDiagnostics.status
      : bridgeStatus;
  const bridgePresentation = getBridgeStatusPresentation(
    effectiveBridgeStatus,
    effectiveBridgeDiagnostics,
  );
  const bridgeColor =
    bridgePresentation.tone === "success"
      ? colors.success
      : bridgePresentation.tone === "error"
        ? colors.error
        : colors.warning;
  const bridgeUrl =
    bridgeInfo?.lanUrl || streamServerUrl || streamEngineManager.getBridgeUrl();
  const bridgeRuntimeLabel =
    effectiveBridgeDiagnostics.platform &&
    effectiveBridgeDiagnostics.processArch
      ? `${effectiveBridgeDiagnostics.platform}/${effectiveBridgeDiagnostics.processArch}`
      : null;

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
        style={[styles.addonsCard, { borderColor: colors.border }]}
        onPress={() => {
          hapticSelection();
          router.push("/addons");
        }}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: "rgba(216,180,254,0.14)" },
          ]}
        >
          <Ionicons name="extension-puzzle-outline" size={20} color="#d8b4fe" />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {t("settings.items.manageAddons")}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            {t("settings.subtitles.manageAddons")}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      <View style={[styles.bridgeCard, { borderColor: colors.border }]}>
        <View style={styles.bridgeHeader}>
          <View style={[styles.statusDot, { backgroundColor: bridgeColor }]} />
          <Text style={[styles.bridgeTitle, { color: colors.text }]}>
            {bridgePresentation.title}
          </Text>
        </View>
        <Text style={[styles.bridgeText, { color: colors.textSecondary }]}>
          {bridgePresentation.detail}
        </Text>
        <Text style={[styles.bridgeUrlText, { color: colors.textSecondary }]}>
          {bridgeUrl}
        </Text>
        {(effectiveBridgeDiagnostics.reason || bridgeRuntimeLabel) && (
          <View
            style={[
              styles.diagnosticsBox,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.62)",
                borderColor: colors.border,
              },
            ]}
          >
            {!!effectiveBridgeDiagnostics.reason && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Reason: {formatBridgeReason(effectiveBridgeDiagnostics.reason)}
              </Text>
            )}
            {!!bridgeRuntimeLabel && (
              <Text
                style={[
                  styles.diagnosticsText,
                  { color: colors.textSecondary },
                ]}
              >
                Runtime: {bridgeRuntimeLabel}
              </Text>
            )}
          </View>
        )}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionButton, { borderColor: colors.border }]}
            onPress={handleCheckBridge}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.tint} />
            <Text style={[styles.actionText, { color: colors.tint }]}>
              Check again
            </Text>
          </Pressable>
          {bridgeInfo?.lanUrl && (
            <Pressable
              style={[styles.actionButton, { borderColor: colors.border }]}
              onPress={() => {
                setTempStream(bridgeInfo.lanUrl);
                if (bridgeInfo.pairingToken) {
                  setTempStreamToken(bridgeInfo.pairingToken);
                }
                hapticSelection();
              }}
            >
              <Ionicons name="copy-outline" size={16} color={colors.tint} />
              <Text style={[styles.actionText, { color: colors.tint }]}>
                Use LAN URL
              </Text>
            </Pressable>
          )}
          {Platform.OS === "web" && window.desktopBridge?.restartBridge && (
            <Pressable
              style={[styles.actionButton, { borderColor: colors.border }]}
              onPress={handleRestartBridge}
              disabled={isRestartingBridge}
            >
              <Ionicons name="reload-outline" size={16} color={colors.tint} />
              <Text style={[styles.actionText, { color: colors.tint }]}>
                {isRestartingBridge ? "Restarting..." : "Restart bridge"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {t("settings.advanced.backendLabel")}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={tempBackend}
        onChangeText={setTempBackend}
        placeholder="e.g. http://192.168.1.50:3001"
        placeholderTextColor={colors.textSecondary + "80"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {t("settings.advanced.streamLabel")}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={tempStream}
        onChangeText={setTempStream}
        placeholder="e.g. http://192.168.1.50:11470"
        placeholderTextColor={colors.textSecondary + "80"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Bridge pairing token (optional)
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={tempStreamToken}
        onChangeText={setTempStreamToken}
        placeholder="Only needed when your bridge requires a token"
        placeholderTextColor={colors.textSecondary + "80"}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={16} color="#fbbf24" />
        <Text style={styles.warningText}>{t("settings.advanced.warning")}</Text>
      </View>

      <View style={[styles.serviceCard, { borderColor: colors.border }]}>
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
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.resetButton, { borderColor: colors.border }]}
          onPress={handleReset}
        >
          <Text
            style={[styles.resetButtonText, { color: colors.textSecondary }]}
          >
            {t("settings.advanced.restore")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.tint }]}
          onPress={handleSave}
        >
          <Text
            style={[styles.saveButtonText, { color: isDark ? "#000" : "#fff" }]}
          >
            {t("settings.advanced.apply")}
          </Text>
        </Pressable>
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
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(216,180,254,0.08)",
    padding: 16,
  },
  bridgeCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 10,
  },
  serviceCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(242,215,255,0.06)",
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
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
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
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: -8,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    fontSize: 15,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    padding: 14,
    borderRadius: 12,
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
  resetButton: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "bold",
  },
});
