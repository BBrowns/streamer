import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { castService, type CastDevice } from "../services/CastService";
import {
  prepareCast,
  type CastOrchestratorSuccess,
  type PlaybackOrchestratorInput,
} from "../services/playback/PlaybackOrchestrator";
import {
  getCastContentType,
  startCastSession,
} from "../services/playback/PlaybackSessionCastService";
import { cancelPlaybackSession } from "../services/playback/PlaybackSessionPlaybackService";
import {
  getCastSessionProfile,
  getChromecastDeviceProfile,
  type CastDeviceCapabilities,
} from "../services/playback/deviceProfile";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "./ui/designSystem";
import { AppButton } from "./ui/AppButton";
import { getCastRecovery } from "../services/actionRecovery";
import type { CastRecoveryGuidance } from "../types/actionRecovery";
import { useTheme } from "../hooks/useTheme";
import { useReducedMotion } from "../hooks/useReducedMotion";

export interface CastStartDetails {
  sessionId?: string;
  source?: CastOrchestratorSuccess;
}

interface Props {
  visible: boolean;
  orchestratorInput?: PlaybackOrchestratorInput;
  playbackUri?: string;
  title: string;
  onClose: () => void;
  onOpenSourcesDevices?: () => void;
  onCastStart?: (device: CastDevice, details: CastStartDetails) => void;
}

type SourceReadiness = "idle" | "preparing" | "fallback" | "ready" | "failed";

function getDeviceCapabilitySummary(device: CastDevice) {
  const capabilities = device.capabilities;
  if (!capabilities) return device.type;

  const formats = [
    capabilities.supportsMp4 !== false ? "MP4" : null,
    capabilities.supportsHls ? "HLS" : null,
    capabilities.supportsMkv ? "MKV" : null,
    capabilities.remuxAllowed !== false ? "Remux" : null,
  ].filter((label): label is string => Boolean(label));

  return formats.length > 0 ? formats.join(" · ") : device.type;
}

export function DesktopCastModal({
  visible,
  orchestratorInput,
  playbackUri = "",
  title,
  onClose,
  onOpenSourcesDevices,
  onCastStart,
}: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [castingTo, setCastingTo] = useState<string | null>(null);
  const [sourceReadiness, setSourceReadiness] =
    useState<SourceReadiness>("idle");
  const [preparedCast, setPreparedCast] =
    useState<CastOrchestratorSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<CastRecoveryGuidance | null>(null);
  const devicesRef = useRef<CastDevice[]>([]);
  const orchestratorInputRef = useRef(orchestratorInput);
  const requestIdRef = useRef(0);
  const preparedSessionIdRef = useRef<string | null>(null);
  const handedOffSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    orchestratorInputRef.current = orchestratorInput;
  }, [orchestratorInput]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const cancelPreparedSession = useCallback(() => {
    const sessionId = preparedSessionIdRef.current;
    if (sessionId && sessionId !== handedOffSessionIdRef.current) {
      cancelPlaybackSession(sessionId, "Cast dialog was closed.");
    }
    preparedSessionIdRef.current = null;
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await castService.getDevices());
    } catch (error) {
      setDevices([]);
      const nextRecovery = getCastRecovery(error);
      if (__DEV__) {
        console.warn(
          "[DesktopCastModal] Device discovery failed:",
          nextRecovery.reason,
        );
      }
      setErrorMessage(nextRecovery.message);
      setRecovery(nextRecovery);
    } finally {
      setLoading(false);
    }
  }, []);

  const prepareSource = useCallback(
    async (
      requestId: number,
      capabilities?: CastDeviceCapabilities,
    ): Promise<CastOrchestratorSuccess | null> => {
      const input = orchestratorInputRef.current;
      if (!input) return null;

      setSourceReadiness("preparing");
      setErrorMessage(null);
      setRecovery(null);
      const deviceProfile = getChromecastDeviceProfile(capabilities);
      let result: Awaited<ReturnType<typeof prepareCast>>;
      try {
        result = await prepareCast(input, {
          deviceProfile,
          castProfile: getCastSessionProfile(deviceProfile, capabilities),
        });
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return null;
        setPreparedCast(null);
        setSourceReadiness("failed");
        const nextRecovery = getCastRecovery(error, {
          hasDeviceCapabilities: devicesRef.current.some(
            (device) => device.capabilities,
          ),
        });
        setErrorMessage(nextRecovery.message);
        setRecovery(nextRecovery);
        return null;
      }

      if (requestId !== requestIdRef.current) {
        if (result.sessionId) {
          cancelPlaybackSession(result.sessionId, "Cast preparation expired.");
        }
        return null;
      }

      preparedSessionIdRef.current = result.sessionId || null;
      if (!result.ok) {
        const nextRecovery = getCastRecovery(result.error, {
          hasDeviceCapabilities: devicesRef.current.some(
            (device) => device.capabilities,
          ),
        });
        setPreparedCast(null);
        setSourceReadiness("failed");
        setErrorMessage(nextRecovery.message);
        setRecovery(nextRecovery);
        return null;
      }

      setPreparedCast(result);
      setSourceReadiness("ready");
      setRecovery(null);
      return result;
    },
    [],
  );

  useEffect(() => {
    if (!visible) return;

    const requestId = ++requestIdRef.current;
    handedOffSessionIdRef.current = null;
    preparedSessionIdRef.current = null;
    setCastingTo(null);
    setPreparedCast(null);
    setErrorMessage(null);
    setRecovery(null);
    void fetchDevices();

    if (orchestratorInputRef.current) {
      void prepareSource(requestId);
    } else if (playbackUri) {
      setSourceReadiness("ready");
    } else {
      setSourceReadiness("failed");
      const nextRecovery = getCastRecovery(
        new Error("No cast-ready source is available."),
      );
      setErrorMessage(nextRecovery.message);
      setRecovery(nextRecovery);
    }

    return () => {
      requestIdRef.current += 1;
      cancelPreparedSession();
    };
  }, [
    cancelPreparedSession,
    fetchDevices,
    playbackUri,
    prepareSource,
    visible,
  ]);

  const handleCast = async (device: CastDevice) => {
    setCastingTo(device.id);
    setErrorMessage(null);

    try {
      let source = preparedCast;
      if (orchestratorInputRef.current && device.capabilities) {
        cancelPreparedSession();
        const requestId = ++requestIdRef.current;
        source = await prepareSource(requestId, device.capabilities);
      }

      if (orchestratorInputRef.current) {
        if (!source) {
          throw new Error("No cast-ready source is available.");
        }

        const result = await startCastSession(
          device,
          title,
          {
            sessionId: source.sessionId,
            candidateId: source.candidateId,
            attemptId: source.attemptId,
            stream: source.stream,
            uri: source.resolvedUrl,
          },
          {
            onFallback: () => setSourceReadiness("fallback"),
          },
        );
        if (!result.ok) {
          throw result.error;
        }

        handedOffSessionIdRef.current = result.sessionId;
        onCastStart?.(device, {
          sessionId: result.sessionId,
          source: {
            ...source,
            stream: result.stream,
            resolvedUrl: result.uri,
            candidateId: result.candidateId,
            attemptId: result.attemptId,
          },
        });
        return;
      }

      if (!playbackUri) {
        throw new Error("No cast-ready source is available.");
      }

      await castService.play(
        device.id,
        playbackUri,
        title,
        getCastContentType({ url: playbackUri }, playbackUri),
      );
      onCastStart?.(device, {});
    } catch (error: any) {
      const nextRecovery = getCastRecovery(error, {
        hasDeviceCapabilities: Boolean(device.capabilities),
      });
      if (__DEV__) {
        console.warn("[DesktopCastModal] Cast failed:", nextRecovery.reason);
      }
      setCastingTo(null);
      setSourceReadiness("failed");
      setErrorMessage(nextRecovery.message);
      setRecovery(nextRecovery);
    }
  };

  const handleRecovery = useCallback(() => {
    if (!recovery) return;
    if (recovery.action === "repair_bridge") {
      if (onOpenSourcesDevices) onOpenSourcesDevices();
      else onClose();
      return;
    }
    if (recovery.action === "refresh_devices") {
      setErrorMessage(null);
      setRecovery(null);
      void fetchDevices();
      return;
    }
    if (
      recovery.action === "retry" ||
      recovery.action === "replan" ||
      recovery.action === "choose_compatible_device"
    ) {
      const deviceWithCapabilities = devices.find(
        (device) => device.capabilities,
      );
      const requestId = ++requestIdRef.current;
      void prepareSource(requestId, deviceWithCapabilities?.capabilities);
      return;
    }
    onClose();
  }, [
    devices,
    fetchDevices,
    onClose,
    onOpenSourcesDevices,
    prepareSource,
    recovery,
  ]);

  const sourceStatusText =
    sourceReadiness === "preparing"
      ? t("player.controls.remuxPreparing", {
          defaultValue: "Preparing a cast-ready source...",
        })
      : sourceReadiness === "fallback"
        ? t("player.status.tryingFallback", {
            defaultValue: "Trying another compatible source...",
          })
        : sourceReadiness === "ready"
          ? preparedCast?.plan.requiresRemux
            ? "A compatible stream is ready. Choose a display."
            : "Source ready. Choose a display."
          : sourceReadiness === "failed"
            ? "A cast-ready source could not be prepared."
            : null;
  const readinessColor =
    sourceReadiness === "failed"
      ? colors.error
      : sourceReadiness === "fallback"
        ? colors.warning
        : sourceReadiness === "ready"
          ? colors.success
          : colors.tint;

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "fade"}
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={t("player.controls.cast", {
            defaultValue: "Cast",
          })}
          style={[styles.container, { backgroundColor: colors.card }]}
        >
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <MaterialIcons
                name="cast"
                size={24}
                color={colors.tint}
                style={styles.headerIcon}
              />
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t("player.controls.cast", { defaultValue: "Cast" })}
                </Text>
                <Text
                  style={[styles.subtitle, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("player.controls.close", {
                defaultValue: "Close",
              })}
              style={({ pressed, focused }: any) => [
                styles.closeBtnWrapper,
                { backgroundColor: colors.surfaceElevated },
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
            >
              <MaterialIcons
                name="close"
                size={22}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {!!sourceStatusText && (
            <View
              style={[
                styles.readiness,
                {
                  backgroundColor: readinessColor + "12",
                  borderColor: readinessColor + "38",
                },
              ]}
            >
              {sourceReadiness === "preparing" ? (
                <ActivityIndicator size="small" color={readinessColor} />
              ) : (
                <MaterialIcons
                  name={
                    sourceReadiness === "ready"
                      ? "check-circle"
                      : sourceReadiness === "fallback"
                        ? "sync"
                        : "error"
                  }
                  size={18}
                  color={readinessColor}
                />
              )}
              <Text style={[styles.readinessText, { color: colors.text }]}>
                {sourceStatusText}
              </Text>
            </View>
          )}

          {errorMessage && (
            <Text style={[styles.errorText, { color: colors.error }]}>
              {errorMessage}
            </Text>
          )}
          {recovery && recovery.action !== "choose_compatible_device" ? (
            <AppButton
              label={recovery.actionLabel}
              icon={
                recovery.action === "repair_bridge"
                  ? "construct-outline"
                  : "refresh"
              }
              variant="secondary"
              size="small"
              onPress={handleRecovery}
              style={styles.recoveryButton}
            />
          ) : null}

          {loading && devices.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Searching for displays...
              </Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.centerBox}>
              <MaterialIcons name="tv-off" size={44} color={colors.disabled} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No displays found on this network
              </Text>
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(device) => device.id}
              contentContainerStyle={styles.deviceList}
              renderItem={({ item }) => {
                const isCasting = castingTo === item.id;
                const canRetryWithDeviceCapabilities =
                  sourceReadiness === "failed" && !!item.capabilities;
                const deviceDisabled =
                  castingTo !== null ||
                  loading ||
                  (sourceReadiness !== "ready" &&
                    !canRetryWithDeviceCapabilities);
                const iconName =
                  item.type === "chromecast" ? "cast" : "airplay";
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}. ${
                      isCasting
                        ? t("player.cast.castingTo", {
                            name: item.name,
                            defaultValue: "Connecting to display...",
                          })
                        : `Available. ${getDeviceCapabilitySummary(item)}`
                    }`}
                    accessibilityState={{
                      disabled: deviceDisabled,
                      busy: isCasting,
                    }}
                    style={({ hovered, pressed, focused }: any) => [
                      styles.deviceItem,
                      { backgroundColor: colors.surfaceElevated },
                      hovered &&
                        !deviceDisabled && {
                          backgroundColor: colors.surfaceSubtle,
                        },
                      isCasting && {
                        backgroundColor: colors.tint,
                        borderColor: colors.tint,
                      },
                      pressed && !deviceDisabled && styles.pressed,
                      deviceDisabled && !isCasting && styles.deviceDisabled,
                      Platform.OS === "web" &&
                        focused &&
                        getWebFocusStyle(colors.focus),
                    ]}
                    onPress={() => handleCast(item)}
                    disabled={deviceDisabled}
                  >
                    <View style={styles.deviceInfoContainer}>
                      <MaterialIcons
                        name={iconName}
                        size={26}
                        color={isCasting ? colors.onTint : colors.tint}
                      />
                      <View style={styles.deviceTextCol}>
                        <Text
                          style={[
                            styles.deviceName,
                            {
                              color: isCasting ? colors.onTint : colors.text,
                            },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[
                            styles.deviceType,
                            {
                              color: isCasting
                                ? colors.onTint
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {isCasting
                            ? t("player.cast.castingTo", {
                                name: item.name,
                                defaultValue: "Connecting to display...",
                              })
                            : `Available · ${getDeviceCapabilitySummary(item)}`}
                        </Text>
                      </View>
                    </View>
                    {isCasting ? (
                      <ActivityIndicator size="small" color={colors.onTint} />
                    ) : (
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color={colors.textSecondary}
                      />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            style={({ pressed, focused }: any) => [
              styles.refreshBtn,
              pressed && styles.pressed,
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
            onPress={fetchDevices}
            disabled={loading}
          >
            <MaterialIcons
              name="refresh"
              size={20}
              color={loading ? colors.disabled : colors.text}
              style={styles.refreshIcon}
            />
            <Text
              style={[
                styles.refreshText,
                { color: loading ? colors.disabled : colors.text },
              ]}
            >
              {loading ? "Scanning..." : "Refresh displays"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: uiSpacing.xl,
  },
  container: {
    borderRadius: uiRadii.sheet,
    padding: uiSpacing.xxl,
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: uiSpacing.xl - 2,
  },
  headerTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    marginRight: uiSpacing.sm + 2,
  },
  title: {
    ...uiTypography.title,
  },
  subtitle: {
    ...uiTypography.label,
    marginTop: 2,
    maxWidth: 300,
  },
  closeBtnWrapper: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiRadii.control,
  },
  pressed: {
    opacity: 0.72,
  },
  readiness: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    borderWidth: 1,
    borderRadius: uiRadii.card,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm + 2,
    marginBottom: uiSpacing.md,
  },
  readinessText: {
    ...uiTypography.label,
    flex: 1,
  },
  errorText: {
    ...uiTypography.label,
    marginBottom: uiSpacing.md,
  },
  recoveryButton: {
    marginBottom: uiSpacing.md,
    alignSelf: "flex-start",
    paddingHorizontal: uiSpacing.lg,
  },
  emptyText: {
    ...uiTypography.body,
    textAlign: "center",
    marginTop: uiSpacing.md,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: uiSpacing.xxxl,
  },
  deviceList: {
    gap: uiSpacing.md,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
    padding: uiSpacing.lg,
    borderRadius: uiRadii.card,
    borderWidth: 1,
    borderColor: "transparent",
  },
  deviceDisabled: {
    opacity: 0.55,
  },
  deviceInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.lg - 2,
    flex: 1,
    minWidth: 0,
  },
  deviceTextCol: {
    justifyContent: "center",
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    ...uiTypography.label,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 3,
  },
  deviceType: {
    ...uiTypography.caption,
    textTransform: "capitalize",
  },
  refreshBtn: {
    marginTop: uiSpacing.xl - 2,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: uiRadii.control,
  },
  refreshIcon: {
    marginRight: uiSpacing.sm,
  },
  refreshText: {
    ...uiTypography.control,
  },
});
