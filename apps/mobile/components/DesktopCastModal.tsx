import React, { useCallback, useEffect, useReducer, useRef } from "react";
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
import { useTheme } from "../hooks/useTheme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  castDialogReducer,
  hasUsableCastFallback,
  initialCastDialogState,
} from "./cast/castDialogState";

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
  const [state, dispatch] = useReducer(
    castDialogReducer,
    initialCastDialogState,
  );
  const orchestratorInputRef = useRef(orchestratorInput);
  const requestIdRef = useRef(0);
  const preparedSessionIdRef = useRef<string | null>(null);
  const handedOffSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    orchestratorInputRef.current = orchestratorInput;
  }, [orchestratorInput]);

  const cancelPreparedSession = useCallback(() => {
    const sessionId = preparedSessionIdRef.current;
    if (sessionId && sessionId !== handedOffSessionIdRef.current) {
      cancelPlaybackSession(sessionId, "Cast dialog was closed.");
    }
    preparedSessionIdRef.current = null;
  }, []);

  const prepareSource = useCallback(
    async (
      requestId: number,
      devices: CastDevice[],
      options: {
        capabilities?: CastDeviceCapabilities;
        device?: CastDevice;
        reason?: "initial" | "device" | "fallback";
      } = {},
    ): Promise<CastOrchestratorSuccess | null> => {
      const input = orchestratorInputRef.current;
      if (!input) return null;

      dispatch({
        type: "preparationStarted",
        devices,
        device: options.device,
        reason: options.reason || "initial",
      });
      const deviceProfile = getChromecastDeviceProfile(options.capabilities);
      let result: Awaited<ReturnType<typeof prepareCast>>;
      try {
        result = await prepareCast(input, {
          deviceProfile,
          castProfile: getCastSessionProfile(
            deviceProfile,
            options.capabilities,
          ),
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) return null;
        const nextRecovery = getCastRecovery(error, {
          hasDeviceCapabilities: devices.some((device) => device.capabilities),
        });
        dispatch({
          type: "preparationFailed",
          devices,
          device: options.device,
          recovery: nextRecovery,
          canTryAnotherSource: false,
        });
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
          hasDeviceCapabilities: devices.some((device) => device.capabilities),
        });
        dispatch({
          type: "preparationFailed",
          devices,
          device: options.device,
          recovery: nextRecovery,
          canTryAnotherSource: hasUsableCastFallback(result),
        });
        return null;
      }

      dispatch({ type: "sourceReady", devices, source: result });
      return result;
    },
    [],
  );

  const discoverDevices = useCallback(
    async (requestId: number) => {
      dispatch({ type: "discoveryStarted" });
      let devices: CastDevice[];
      try {
        devices = await castService.getDevices();
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        const nextRecovery = getCastRecovery(error);
        if (__DEV__) {
          console.warn(
            "[DesktopCastModal] Device discovery failed:",
            nextRecovery.reason,
          );
        }
        dispatch({ type: "discoveryFailed", recovery: nextRecovery });
        return;
      }

      if (requestId !== requestIdRef.current) return;
      if (devices.length === 0) {
        dispatch({ type: "discoveryEmpty" });
        return;
      }

      if (orchestratorInputRef.current) {
        await prepareSource(requestId, devices);
        return;
      }
      if (playbackUri) {
        dispatch({ type: "sourceReady", devices });
        return;
      }

      dispatch({
        type: "preparationFailed",
        devices,
        recovery: getCastRecovery(
          new Error("No cast-ready source is available."),
        ),
        canTryAnotherSource: false,
      });
    },
    [playbackUri, prepareSource],
  );

  const restartDiscovery = useCallback(() => {
    cancelPreparedSession();
    const requestId = ++requestIdRef.current;
    void discoverDevices(requestId);
  }, [cancelPreparedSession, discoverDevices]);

  useEffect(() => {
    if (!visible) return;

    const requestId = ++requestIdRef.current;
    handedOffSessionIdRef.current = null;
    preparedSessionIdRef.current = null;
    void discoverDevices(requestId);

    return () => {
      requestIdRef.current += 1;
      cancelPreparedSession();
    };
  }, [cancelPreparedSession, discoverDevices, visible]);

  const handleCast = useCallback(
    async (device: CastDevice) => {
      const isConnectionRetry =
        state.status === "connectionFailure" &&
        state.phase === "connection" &&
        state.device?.id === device.id;
      if (
        state.status !== "ready" &&
        !isConnectionRetry &&
        !(state.status === "unsupportedDevice" && state.showDevicePicker)
      ) {
        return;
      }

      const devices = state.devices;
      let source = "source" in state ? state.source : undefined;
      if (
        orchestratorInputRef.current &&
        (device.capabilities || isConnectionRetry)
      ) {
        cancelPreparedSession();
        const requestId = ++requestIdRef.current;
        source =
          (await prepareSource(requestId, devices, {
            capabilities: device.capabilities,
            device,
            reason: isConnectionRetry ? "initial" : "device",
          })) || undefined;
        if (!source) return;
      }

      dispatch({ type: "castStarted", devices, device, source });

      try {
        if (orchestratorInputRef.current) {
          if (!source) {
            const recovery = getCastRecovery(
              new Error("No cast-ready source is available."),
            );
            dispatch({
              type: "castFailed",
              devices,
              device,
              source,
              recovery,
              canTryAnotherSource: false,
            });
            return;
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
              onFallback: () => dispatch({ type: "castFallbackStarted" }),
            },
          );
          if (!result.ok) {
            const recovery = getCastRecovery(result.error, {
              hasDeviceCapabilities: Boolean(device.capabilities),
            });
            dispatch({
              type: "castFailed",
              devices,
              device,
              source,
              recovery,
              canTryAnotherSource: hasUsableCastFallback({
                error: result.error,
                plan: source.plan,
              }),
            });
            return;
          }

          const connectedSource = {
            ...source,
            stream: result.stream,
            resolvedUrl: result.uri,
            candidateId: result.candidateId,
            attemptId: result.attemptId,
          };
          handedOffSessionIdRef.current = result.sessionId;
          dispatch({
            type: "castConnected",
            devices,
            device,
            source: connectedSource,
            sessionId: result.sessionId,
          });
          onCastStart?.(device, {
            sessionId: result.sessionId,
            source: connectedSource,
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
        dispatch({ type: "castConnected", devices, device });
        onCastStart?.(device, {});
      } catch (error) {
        const nextRecovery = getCastRecovery(error, {
          hasDeviceCapabilities: Boolean(device.capabilities),
        });
        if (__DEV__) {
          console.warn("[DesktopCastModal] Cast failed:", nextRecovery.reason);
        }
        dispatch({
          type: "castFailed",
          devices,
          device,
          source,
          recovery: nextRecovery,
          canTryAnotherSource: false,
        });
      }
    },
    [
      cancelPreparedSession,
      playbackUri,
      prepareSource,
      state,
      title,
      onCastStart,
    ],
  );

  const handleRecovery = useCallback(() => {
    if (state.status === "noDevices") {
      restartDiscovery();
      return;
    }

    if (state.status === "unsupportedDevice") {
      const alternativeDevices = state.devices.filter(
        (device) => device.id !== state.rejectedDeviceId,
      );
      if (alternativeDevices.length > 0 && !state.showDevicePicker) {
        dispatch({ type: "devicePickerOpened" });
        return;
      }
      if (state.canTryAnotherSource && orchestratorInputRef.current) {
        cancelPreparedSession();
        const requestId = ++requestIdRef.current;
        void prepareSource(requestId, state.devices, { reason: "fallback" });
      }
      return;
    }

    if (state.status === "preparationFailure") {
      if (state.recovery.action === "repair_bridge") {
        if (onOpenSourcesDevices) onOpenSourcesDevices();
        else onClose();
        return;
      }
      if (!orchestratorInputRef.current) return;
      if (state.recovery.action === "replan" && !state.canTryAnotherSource) {
        return;
      }
      cancelPreparedSession();
      const requestId = ++requestIdRef.current;
      void prepareSource(requestId, state.devices, {
        capabilities: state.device?.capabilities,
        device: state.device,
        reason: state.canTryAnotherSource ? "fallback" : "initial",
      });
      return;
    }

    if (state.status === "connectionFailure") {
      if (state.recovery.action === "repair_bridge") {
        if (onOpenSourcesDevices) onOpenSourcesDevices();
        else onClose();
        return;
      }
      if (
        state.phase === "discovery" ||
        state.recovery.action === "refresh_devices"
      ) {
        restartDiscovery();
        return;
      }
      if (state.device) void handleCast(state.device);
    }
  }, [
    cancelPreparedSession,
    handleCast,
    onClose,
    onOpenSourcesDevices,
    prepareSource,
    restartDiscovery,
    state,
  ]);

  const preparedSource = "source" in state ? state.source : undefined;
  const statusText = (() => {
    switch (state.status) {
      case "discovering":
        return t("player.cast.searching", {
          defaultValue: "Searching for displays...",
        });
      case "noDevices":
        return t("player.cast.noDevices", {
          defaultValue: "No displays found on this network.",
        });
      case "preparing":
        return state.reason === "fallback"
          ? t("player.status.tryingFallback", {
              defaultValue: "Trying another compatible source...",
            })
          : t("player.controls.remuxPreparing", {
              defaultValue: "Preparing a cast-ready source...",
            });
      case "ready":
        return preparedSource?.plan.requiresRemux
          ? t("player.cast.compatibleReady", {
              defaultValue: "A compatible stream is ready. Choose a display.",
            })
          : t("player.cast.sourceReady", {
              defaultValue: "Source ready. Choose a display.",
            });
      case "preparationFailure":
      case "unsupportedDevice":
      case "connectionFailure":
        return state.recovery.message;
      case "casting":
        return state.tryingFallback
          ? t("player.status.tryingFallback", {
              defaultValue: "Trying another compatible source...",
            })
          : t("player.cast.connecting", {
              name: state.device.name,
              defaultValue: "Connecting to {{name}}...",
            });
      case "connected":
        return t("player.cast.connected", {
          name: state.device.name,
          defaultValue: "Connected to {{name}}.",
        });
    }
  })();
  const statusColor =
    state.status === "preparationFailure" ||
    state.status === "connectionFailure"
      ? colors.error
      : state.status === "unsupportedDevice"
        ? colors.warning
        : state.status === "ready" || state.status === "connected"
          ? colors.success
          : colors.tint;
  const statusBusy =
    state.status === "discovering" ||
    state.status === "preparing" ||
    state.status === "casting";
  const recoveryLabel = (() => {
    if (state.status === "noDevices") {
      return t("player.cast.refreshDisplays", {
        defaultValue: "Refresh displays",
      });
    }
    if (state.status === "unsupportedDevice") {
      if (state.showDevicePicker) return null;
      const hasAlternativeDevice = state.devices.some(
        (device) => device.id !== state.rejectedDeviceId,
      );
      if (hasAlternativeDevice) {
        return t("player.cast.chooseAnotherDevice", {
          defaultValue: "Choose another device",
        });
      }
      return state.canTryAnotherSource
        ? t("player.cast.tryAnotherSource", {
            defaultValue: "Try another source",
          })
        : null;
    }
    if (state.status === "preparationFailure") {
      if (state.recovery.action === "repair_bridge") {
        return t("player.cast.sourcesDevices", {
          defaultValue: "Sources & Devices",
        });
      }
      if (state.recovery.action === "replan" && !state.canTryAnotherSource) {
        return null;
      }
      return state.canTryAnotherSource
        ? t("player.cast.tryAnotherSource", {
            defaultValue: "Try another source",
          })
        : state.recovery.actionLabel;
    }
    if (state.status === "connectionFailure") {
      return state.recovery.action === "repair_bridge"
        ? t("player.cast.sourcesDevices", {
            defaultValue: "Sources & Devices",
          })
        : state.recovery.actionLabel;
    }
    return null;
  })();
  const showDeviceList =
    state.devices.length > 0 &&
    (state.status === "ready" ||
      state.status === "preparing" ||
      state.status === "casting" ||
      state.status === "connected" ||
      (state.status === "unsupportedDevice" && state.showDevicePicker));

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

          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.readiness,
              {
                backgroundColor: statusColor + "12",
                borderColor: statusColor + "38",
              },
            ]}
          >
            {statusBusy ? (
              <ActivityIndicator size="small" color={statusColor} />
            ) : (
              <MaterialIcons
                name={
                  state.status === "ready" || state.status === "connected"
                    ? "check-circle"
                    : state.status === "noDevices"
                      ? "tv-off"
                      : state.status === "unsupportedDevice" ||
                          state.status === "preparationFailure" ||
                          state.status === "connectionFailure"
                        ? "error"
                        : "cast"
                }
                size={18}
                color={statusColor}
              />
            )}
            <Text style={[styles.readinessText, { color: colors.text }]}>
              {statusText}
            </Text>
          </View>

          {recoveryLabel ? (
            <AppButton
              label={recoveryLabel}
              icon={
                (state.status === "preparationFailure" ||
                  state.status === "connectionFailure") &&
                state.recovery.action === "repair_bridge"
                  ? "construct-outline"
                  : state.status === "unsupportedDevice"
                    ? "tv-outline"
                    : "refresh"
              }
              variant="secondary"
              size="small"
              onPress={handleRecovery}
              style={styles.recoveryButton}
            />
          ) : null}

          {showDeviceList ? (
            <FlatList
              data={state.devices.filter(
                (device) =>
                  state.status !== "unsupportedDevice" ||
                  device.id !== state.rejectedDeviceId,
              )}
              keyExtractor={(device) => device.id}
              contentContainerStyle={styles.deviceList}
              renderItem={({ item }) => {
                const isActiveDevice =
                  (state.status === "casting" ||
                    state.status === "connected") &&
                  state.device.id === item.id;
                const isCasting =
                  state.status === "casting" && state.device.id === item.id;
                const isConnected =
                  state.status === "connected" && state.device.id === item.id;
                const deviceDisabled =
                  state.status !== "ready" &&
                  !(
                    state.status === "unsupportedDevice" &&
                    state.showDevicePicker
                  );
                const iconName =
                  item.type === "chromecast" ? "cast" : "airplay";
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}. ${
                      isConnected
                        ? statusText
                        : isCasting
                          ? t("player.cast.castingTo", {
                              name: item.name,
                              defaultValue: "Connecting to display...",
                            })
                          : t("player.cast.available", {
                              defaultValue: "Available",
                            })
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
                      isActiveDevice && {
                        backgroundColor: colors.tint,
                        borderColor: colors.tint,
                      },
                      pressed && !deviceDisabled && styles.pressed,
                      deviceDisabled &&
                        !isActiveDevice &&
                        styles.deviceDisabled,
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
                        color={isActiveDevice ? colors.onTint : colors.tint}
                      />
                      <View style={styles.deviceTextCol}>
                        <Text
                          style={[
                            styles.deviceName,
                            {
                              color: isActiveDevice
                                ? colors.onTint
                                : colors.text,
                            },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[
                            styles.deviceType,
                            {
                              color: isActiveDevice
                                ? colors.onTint
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {isConnected
                            ? statusText
                            : isCasting
                              ? t("player.cast.castingTo", {
                                  name: item.name,
                                  defaultValue: "Connecting to display...",
                                })
                              : t("player.cast.available", {
                                  defaultValue: "Available",
                                })}
                        </Text>
                      </View>
                    </View>
                    {isCasting && !isConnected ? (
                      <ActivityIndicator size="small" color={colors.onTint} />
                    ) : isConnected ? (
                      <MaterialIcons
                        name="check"
                        size={24}
                        color={colors.onTint}
                      />
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
          ) : null}
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
  recoveryButton: {
    marginBottom: uiSpacing.md,
    alignSelf: "flex-start",
    paddingHorizontal: uiSpacing.lg,
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
});
