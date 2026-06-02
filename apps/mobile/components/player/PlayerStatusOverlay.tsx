import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import type { StreamMetrics, StreamLoadState } from "../../stores/playerStore";
import type {
  PlaybackRuntimeError,
  PlaybackRuntimeState,
} from "@streamer/shared";

interface PlayerStatusOverlayProps {
  streamState: StreamLoadState;
  runtimeState?: PlaybackRuntimeState;
  streamMetrics: StreamMetrics | null;
  isBuffering: boolean;
  errorMessage: string | null;
  runtimeError?: PlaybackRuntimeError | null;
  fallbackReason?: string | null;
  onBack: () => void;
  onRetry?: () => void;
  onOpenSourcesDevices?: () => void;
}

export function PlayerStatusOverlay({
  streamState,
  runtimeState = "idle",
  streamMetrics,
  isBuffering,
  errorMessage,
  runtimeError,
  fallbackReason,
  onBack,
  onRetry,
  onOpenSourcesDevices,
}: PlayerStatusOverlayProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  if (streamState === "loading_metrics") {
    const title = getLoadingTitle(runtimeState, streamMetrics, t);
    const metricsDetail =
      streamMetrics && runtimeState !== "trying_fallback"
        ? `${streamMetrics.numPeers} ${t("player.controls.peers")} • ${(
            streamMetrics.downloadSpeed /
            1024 /
            1024
          ).toFixed(2)} MB/s`
        : null;

    return (
      <View
        style={[
          styles.metricsOverlay,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.8)"
              : "rgba(255,255,255,0.85)",
          },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={colors.tint}
          style={styles.spinner}
        />
        <Text style={[styles.titleText, { color: colors.text }]}>{title}</Text>
        {fallbackReason ? (
          <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
            {fallbackReason}
          </Text>
        ) : metricsDetail ? (
          <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
            {metricsDetail}
          </Text>
        ) : runtimeState === "creating_gateway_job" ||
          runtimeState === "preparing_metadata" ? (
          <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
            {t("player.status.preparingSubtitle")}
          </Text>
        ) : null}
      </View>
    );
  }

  if (streamState === "error") {
    const canRetry = !!onRetry && runtimeError?.retryable !== false;
    const errorTitle = getErrorTitle(runtimeError, t);
    return (
      <View
        style={[
          styles.errorOverlay,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.95)"
              : "rgba(255,255,255,0.95)",
          },
        ]}
      >
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colors.error}
          style={styles.errorIcon}
        />
        <Text style={[styles.errorTitle, { color: colors.error }]}>
          {errorTitle}
        </Text>
        <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
          {runtimeError?.message ||
            errorMessage ||
            t("player.status.errorSubtitle")}
        </Text>
        <View style={styles.errorActions}>
          {canRetry && (
            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: colors.tint, borderColor: colors.tint },
              ]}
              onPress={onRetry}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: isDark ? "#000" : "#fff" },
                ]}
              >
                {t("common.retry")}
              </Text>
            </Pressable>
          )}
          {!!onOpenSourcesDevices && (
            <Pressable
              style={[
                styles.backButton,
                {
                  backgroundColor: colors.tint + "15",
                  borderColor: colors.border,
                },
              ]}
              onPress={onOpenSourcesDevices}
            >
              <Text style={[styles.backButtonText, { color: colors.text }]}>
                {t("player.errors.openSourcesDevices")}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[
              styles.backButton,
              {
                backgroundColor: colors.tint + "15",
                borderColor: colors.border,
              },
            ]}
            onPress={onBack}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>
              {t("player.errors.goBack")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Because of the early returns above, streamState at this point is known
  // to be either "idle" | "playing", so we don't need to re-check streamState
  // to satisfy the compiler to avoid "condition always false" lints.
  if (isBuffering) {
    return (
      <View style={styles.bufferingOverlay}>
        <ActivityIndicator size="large" color="#818cf8" />
      </View>
    );
  }

  return null;
}

function getLoadingTitle(
  runtimeState: PlaybackRuntimeState,
  streamMetrics: StreamMetrics | null,
  t: (key: string) => string,
) {
  if (runtimeState === "trying_fallback") {
    return t("player.status.tryingFallback");
  }

  if (runtimeState === "creating_gateway_job") {
    return t("player.status.creatingGatewayJob");
  }

  if (runtimeState === "preparing_metadata") {
    return t("player.status.preparingMetadata");
  }

  if (
    runtimeState === "finding_peers" ||
    streamMetrics?.state === "finding_peers"
  ) {
    return t("player.status.findingPeers");
  }

  if (streamMetrics?.state === "connecting") {
    return t("player.status.connecting");
  }

  return t("player.status.buffering");
}

function getErrorTitle(
  runtimeError: PlaybackRuntimeError | null | undefined,
  t: (key: string) => string,
) {
  if (!runtimeError) return t("player.status.errorTitle");

  if (
    runtimeError.code === "BRIDGE_UNAVAILABLE" ||
    runtimeError.code === "BRIDGE_UNSUPPORTED"
  ) {
    return t("player.status.bridgeErrorTitle");
  }

  if (runtimeError.code === "NO_PEERS") {
    return t("player.status.noPeersTitle");
  }

  if (runtimeError.code === "UNSUPPORTED_CODEC") {
    return t("player.status.unsupportedTitle");
  }

  if (
    runtimeError.code === "PLAYBACK_TIMEOUT" ||
    runtimeError.code === "GATEWAY_TIMEOUT"
  ) {
    return t("player.status.timeoutTitle");
  }

  if (runtimeError.code === "NETWORK_OFFLINE") {
    return t("player.status.networkTitle");
  }

  return t("player.status.errorTitle");
}

const styles = StyleSheet.create({
  metricsOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  spinner: { marginBottom: 16 },
  titleText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  subtitleText: { color: "#a1a1aa", marginTop: 8, fontSize: 14 },
  errorOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  errorIcon: { marginBottom: 16 },
  errorTitle: {
    color: "#fca5a5",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  errorMessage: {
    color: "#a1a1aa",
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 24,
  },
  errorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    maxWidth: 520,
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  backButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: { color: "#fff", fontWeight: "600" },
  bufferingOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    pointerEvents: "none",
  },
});
