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
  onCastStart?: (device: CastDevice, details: CastStartDetails) => void;
}

type SourceReadiness = "idle" | "preparing" | "ready" | "failed";

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
  onCastStart,
}: Props) {
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [castingTo, setCastingTo] = useState<string | null>(null);
  const [sourceReadiness, setSourceReadiness] =
    useState<SourceReadiness>("idle");
  const [preparedCast, setPreparedCast] =
    useState<CastOrchestratorSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await castService.getDevices());
    } catch (error) {
      console.error("Failed to fetch cast devices:", error);
      setDevices([]);
      setErrorMessage(
        "Could not search for displays on the configured bridge.",
      );
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
        setErrorMessage(error?.message || "Casting is unavailable right now.");
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
        setPreparedCast(null);
        setSourceReadiness("failed");
        setErrorMessage(result.error.message);
        return null;
      }

      setPreparedCast(result);
      setSourceReadiness("ready");
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
    void fetchDevices();

    if (orchestratorInputRef.current) {
      void prepareSource(requestId);
    } else if (playbackUri) {
      setSourceReadiness("ready");
    } else {
      setSourceReadiness("failed");
      setErrorMessage("No cast-ready source is available.");
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

        const result = await startCastSession(device, title, {
          sessionId: source.sessionId,
          candidateId: source.candidateId,
          attemptId: source.attemptId,
          stream: source.stream,
          uri: source.resolvedUrl,
        });
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
      console.error("Cast error:", error);
      setCastingTo(null);
      setErrorMessage(error?.message || "Casting is unavailable right now.");
    }
  };

  const sourceStatusText =
    sourceReadiness === "preparing"
      ? "Preparing a cast-ready source..."
      : sourceReadiness === "ready"
        ? "Source ready. Choose a display."
        : sourceReadiness === "failed"
          ? "A cast-ready source could not be prepared."
          : null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          Platform.OS === "web" && ({ backdropFilter: "blur(12px)" } as any),
        ]}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <MaterialIcons
                name="cast"
                size={24}
                color="#c4b5fd"
                style={styles.headerIcon}
              />
              <View>
                <Text style={styles.title}>Cast to a display</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {title}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Close cast dialog"
              style={({ pressed }) => [
                styles.closeBtnWrapper,
                pressed && styles.pressed,
              ]}
            >
              <MaterialIcons name="close" size={22} color="#c4c1d0" />
            </Pressable>
          </View>

          {!!sourceStatusText && (
            <View
              style={[
                styles.readiness,
                sourceReadiness === "failed" && styles.readinessFailed,
              ]}
            >
              {sourceReadiness === "preparing" ? (
                <ActivityIndicator size="small" color="#c4b5fd" />
              ) : (
                <MaterialIcons
                  name={sourceReadiness === "ready" ? "check-circle" : "error"}
                  size={18}
                  color={sourceReadiness === "ready" ? "#86efac" : "#fda4af"}
                />
              )}
              <Text style={styles.readinessText}>{sourceStatusText}</Text>
            </View>
          )}

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {loading && devices.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#c4b5fd" />
              <Text style={styles.emptyText}>Searching for displays...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.centerBox}>
              <MaterialIcons name="tv-off" size={44} color="#777386" />
              <Text style={styles.emptyText}>
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
                    style={({ pressed }) => [
                      styles.deviceItem,
                      isCasting && styles.deviceItemActive,
                      pressed && !deviceDisabled && styles.pressed,
                      deviceDisabled && !isCasting && styles.deviceDisabled,
                    ]}
                    onPress={() => handleCast(item)}
                    disabled={deviceDisabled}
                  >
                    <View style={styles.deviceInfoContainer}>
                      <MaterialIcons
                        name={iconName}
                        size={26}
                        color={isCasting ? "#ffffff" : "#c4b5fd"}
                      />
                      <View style={styles.deviceTextCol}>
                        <Text
                          style={[
                            styles.deviceName,
                            isCasting && styles.deviceNameActive,
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[
                            styles.deviceType,
                            isCasting && styles.deviceTypeActive,
                          ]}
                        >
                          {isCasting
                            ? "Connecting to display..."
                            : `Available · ${getDeviceCapabilitySummary(item)}`}
                        </Text>
                      </View>
                    </View>
                    {isCasting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color="#777386"
                      />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            style={({ pressed }) => [
              styles.refreshBtn,
              pressed && styles.pressed,
            ]}
            onPress={fetchDevices}
            disabled={loading}
          >
            <MaterialIcons
              name="refresh"
              size={20}
              color={loading ? "#777386" : "#d8d4e3"}
              style={styles.refreshIcon}
            />
            <Text
              style={[styles.refreshText, loading && styles.refreshDisabled]}
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
    backgroundColor: "rgba(9, 10, 18, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "rgba(24, 24, 36, 0.94)",
    borderRadius: 16,
    padding: 22,
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(221, 214, 254, 0.18)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  headerTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    marginRight: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: "#a8a4b8",
    fontSize: 13,
    marginTop: 2,
    maxWidth: 300,
  },
  closeBtnWrapper: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: 7,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.72,
  },
  readiness: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(134, 239, 172, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(134, 239, 172, 0.18)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  readinessFailed: {
    backgroundColor: "rgba(253, 164, 175, 0.08)",
    borderColor: "rgba(253, 164, 175, 0.18)",
  },
  readinessText: {
    color: "#dedbea",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  emptyText: {
    color: "#a8a4b8",
    textAlign: "center",
    marginTop: 12,
    fontSize: 15,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
  },
  deviceList: {
    gap: 10,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
  },
  deviceItemActive: {
    backgroundColor: "rgba(139, 92, 246, 0.28)",
    borderColor: "rgba(196, 181, 253, 0.7)",
  },
  deviceDisabled: {
    opacity: 0.55,
  },
  deviceInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  deviceTextCol: {
    justifyContent: "center",
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    color: "#f5f3ff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 3,
  },
  deviceNameActive: {
    color: "#ffffff",
  },
  deviceType: {
    color: "#a8a4b8",
    fontSize: 12,
    textTransform: "capitalize",
  },
  deviceTypeActive: {
    color: "#ede9fe",
  },
  refreshBtn: {
    marginTop: 18,
    padding: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  refreshIcon: {
    marginRight: 8,
  },
  refreshText: {
    color: "#d8d4e3",
    fontWeight: "600",
    fontSize: 14,
  },
  refreshDisabled: {
    color: "#777386",
  },
});
