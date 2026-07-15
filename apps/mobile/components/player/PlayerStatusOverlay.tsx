import {
  View,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import type { StreamMetrics, StreamLoadState } from "../../stores/playerStore";
import type {
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  PlaybackSession,
  PlaybackSessionStatus,
} from "@streamer/shared";
import { PlaybackStatusPanel } from "../ui/PlaybackStatusPanel";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

interface PlayerStatusOverlayProps {
  streamState: StreamLoadState;
  runtimeState?: PlaybackRuntimeState;
  streamMetrics: StreamMetrics | null;
  isBuffering: boolean;
  errorMessage: string | null;
  runtimeError?: PlaybackRuntimeError | null;
  fallbackReason?: string | null;
  session?: PlaybackSession | null;
  onBack: () => void;
  onRetry?: () => void;
  onChooseSource?: () => void;
  onPreviewPlayer?: () => void;
  onOpenSourcesDevices?: () => void;
  onCancelPreparation?: () => void;
}

export function PlayerStatusOverlay({
  streamState,
  runtimeState = "idle",
  streamMetrics,
  isBuffering,
  errorMessage,
  runtimeError,
  fallbackReason,
  session,
  onBack,
  onRetry,
  onChooseSource,
  onPreviewPlayer,
  onOpenSourcesDevices,
  onCancelPreparation,
}: PlayerStatusOverlayProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sessionError = session?.terminalError
    ? { ...session.terminalError }
    : null;
  const effectiveRuntimeError = sessionError || runtimeError;
  const effectiveStreamState =
    session?.status === "failed" ? "error" : streamState;
  const latestFallback = session
    ? [...session.eventLog]
        .reverse()
        .find((event) => event.type === "fallback_started")
    : null;
  const latestGatewayProgress = session
    ? [...session.eventLog]
        .reverse()
        .find((event) => event.type === "gateway_progress")
    : null;
  const effectiveFallbackReason =
    fallbackReason ||
    (latestFallback?.type === "fallback_started"
      ? latestFallback.reason
      : null);

  if (effectiveStreamState === "loading_metrics") {
    const title = getLoadingTitle(
      runtimeState,
      streamMetrics,
      t,
      session?.status,
    );
    const metricsDetail =
      streamMetrics && runtimeState !== "trying_fallback"
        ? `${streamMetrics.numPeers} ${t("player.controls.peers")} • ${(
            streamMetrics.downloadSpeed /
            1024 /
            1024
          ).toFixed(2)} MB/s`
        : latestGatewayProgress?.type === "gateway_progress"
          ? getGatewayProgressDetail(latestGatewayProgress, t)
          : null;
    const message =
      effectiveFallbackReason ||
      metricsDetail ||
      (runtimeState === "creating_gateway_job" ||
      runtimeState === "preparing_metadata"
        ? t("player.status.preparingSubtitle")
        : null);

    return (
      <>
        <PlaybackStatusPanel
          tone={runtimeState === "trying_fallback" ? "warning" : "loading"}
          statusLabel={
            runtimeState === "trying_fallback"
              ? t("player.status.tryingFallback")
              : t("downloads.status.preparing")
          }
          loading={runtimeState !== "trying_fallback"}
          title={title}
          message={message}
        />
        {onCancelPreparation ? (
          <Pressable
            style={({ pressed, hovered, focused }: any) => [
              styles.cancelPreparation,
              {
                backgroundColor: colors.surfaceOverlay,
                borderColor: colors.border,
                opacity: pressed ? 0.76 : 1,
              },
              hovered && styles.cancelPreparationHovered,
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
            onPress={onCancelPreparation}
            accessibilityRole="button"
            accessibilityLabel={t("player.status.cancelPreparation")}
            accessibilityHint={
              Platform.OS === "web"
                ? t("player.status.cancelPreparationHint")
                : undefined
            }
          >
            <Ionicons name="close" size={22} color={colors.text} />
            <Text
              style={[styles.cancelPreparationText, { color: colors.text }]}
            >
              {t("common.cancel")}
            </Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  if (effectiveStreamState === "error") {
    const canRetry = !!onRetry && effectiveRuntimeError?.retryable !== false;
    const errorTitle = getErrorTitle(effectiveRuntimeError, t);
    const actions = [
      ...(canRetry
        ? [
            {
              label: t("common.retry"),
              onPress: onRetry,
              variant: "primary" as const,
              icon: "refresh-outline" as const,
            },
          ]
        : []),
      ...(onChooseSource
        ? [
            {
              label: t("player.errors.chooseSource"),
              onPress: onChooseSource,
              variant: "secondary" as const,
              icon: "layers-outline" as const,
            },
          ]
        : []),
      ...(onPreviewPlayer
        ? [
            {
              label: t("player.errors.previewPlayer"),
              onPress: onPreviewPlayer,
              variant: "secondary" as const,
              icon: "eye-outline" as const,
            },
          ]
        : []),
      ...(onOpenSourcesDevices
        ? [
            {
              label: t("player.errors.openSourcesDevices"),
              onPress: onOpenSourcesDevices,
              variant: "secondary" as const,
              icon: "radio-outline" as const,
            },
          ]
        : []),
      {
        label: t("player.errors.goBack"),
        onPress: onBack,
        variant: "secondary" as const,
        icon: "chevron-back" as const,
      },
    ];

    return (
      <PlaybackStatusPanel
        tone="error"
        statusLabel={t("downloads.status.error")}
        title={errorTitle}
        message={
          effectiveRuntimeError?.message ||
          errorMessage ||
          t("player.status.errorSubtitle")
        }
        actions={actions}
      />
    );
  }

  // Because of the early returns above, streamState at this point is known
  // to be either "idle" | "playing", so we don't need to re-check streamState
  // to satisfy the compiler to avoid "condition always false" lints.
  if (isBuffering) {
    return (
      <View
        style={styles.bufferingOverlay}
        accessibilityLiveRegion="polite"
        accessibilityLabel={t("player.status.buffering")}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return null;
}

function getLoadingTitle(
  runtimeState: PlaybackRuntimeState,
  streamMetrics: StreamMetrics | null,
  t: (key: string) => string,
  sessionStatus?: PlaybackSessionStatus,
) {
  if (sessionStatus) {
    if (sessionStatus === "planning") return t("player.status.planning");
    if (sessionStatus === "checking_bridge")
      return t("player.status.checkingBridge");
    if (sessionStatus === "selecting_candidate")
      return t("player.status.selectingSource");
    if (
      sessionStatus === "attempting_candidate" ||
      sessionStatus === "probing_playback_url"
    ) {
      return t("player.status.checkingSource");
    }
    if (sessionStatus === "creating_gateway_job")
      return t("player.status.creatingGatewayJob");
    if (sessionStatus === "preparing_metadata")
      return t("player.status.preparingMetadata");
    if (sessionStatus === "finding_peers")
      return t("player.status.findingPeers");
    if (sessionStatus === "remuxing") return t("player.status.remuxing");
    if (sessionStatus === "trying_fallback")
      return t("player.status.tryingFallback");
  }

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

function getGatewayProgressDetail(
  event: Extract<
    PlaybackSession["eventLog"][number],
    { type: "gateway_progress" }
  >,
  t: (key: string) => string,
) {
  const parts: string[] = [];
  if (typeof event.peerCount === "number") {
    parts.push(`${event.peerCount} ${t("player.controls.peers")}`);
  }
  if (typeof event.progress === "number") {
    parts.push(`${Math.round(event.progress * 100)}%`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function getErrorTitle(
  runtimeError: PlaybackRuntimeError | null | undefined,
  t: (key: string) => string,
) {
  if (!runtimeError) return t("player.status.errorTitle");

  if (
    runtimeError.code === "NO_SOURCES" ||
    runtimeError.code === "NO_PLAYABLE_SOURCE"
  ) {
    return t("player.status.noSourcesTitle");
  }

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
  cancelPreparation: {
    position: "absolute",
    top: Platform.OS === "web" ? uiSpacing.lg : 56,
    right: uiSpacing.lg,
    zIndex: 40,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpacing.xs,
  },
  cancelPreparationHovered: {
    transform: [{ scale: 1.02 }],
  },
  cancelPreparationText: {
    ...uiTypography.label,
  },
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
