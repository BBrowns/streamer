import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackRuntimeError,
} from "@streamer/shared";
import { useTheme } from "../../hooks/useTheme";

export type PlaybackReadinessTone = "info" | "warning" | "error";

export interface PlaybackReadinessNoticeCopy {
  title: string;
  message: string;
  detail?: string;
  tone: PlaybackReadinessTone;
  icon: keyof typeof Ionicons.glyphMap;
  primaryActionLabel?: string;
}

function actionNoun(action: PlaybackAction) {
  if (action === "download") return "downloads";
  if (action === "cast") return "casting";
  return "playback";
}

function bridgeMessageForAction(
  message: string,
  action: PlaybackAction,
  unsupported: boolean,
) {
  if (action === "play" || !/\bplay(?:back)?\b/i.test(message)) return message;

  if (action === "download") {
    return unsupported
      ? "Desktop bridge needs repair before torrent sources can be downloaded on this device."
      : "Start the desktop bridge to download torrent sources on this device.";
  }

  return unsupported
    ? "Desktop bridge needs repair before torrent sources can be cast on this device."
    : "Start the desktop bridge to cast torrent sources on this device.";
}

export function getPlaybackReadinessCopy(
  plan: PlaybackPlan | null,
  fallback: string,
  action: PlaybackAction,
  errors: string[] = [],
): PlaybackReadinessNoticeCopy {
  const state = plan?.state;
  const message = plan?.userMessage || fallback;
  const attemptedDetail =
    errors.length > 0
      ? `Tried ${errors.length} source${errors.length === 1 ? "" : "s"}. ${errors[0]}`
      : undefined;

  if (state === "needsBridge") {
    return {
      title: "Desktop bridge required",
      message: bridgeMessageForAction(message, action, false),
      detail:
        "Open Sources & Devices to connect this device to your desktop bridge.",
      tone: "warning",
      icon: "desktop-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (state === "bridgeUnavailable") {
    return {
      title: "Bridge needs repair",
      message: bridgeMessageForAction(message, action, true),
      detail: `The app can see the bridge, but the torrent engine is not ready for ${actionNoun(action)}.`,
      tone: "error",
      icon: "construct-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (state === "needsTranscode") {
    return {
      title: "Conversion required",
      message,
      detail:
        "This source needs a conversion job before this device can play it.",
      tone: "warning",
      icon: "sync-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (state === "notFound") {
    return {
      title: "No sources yet",
      message,
      detail: "Try a different title or add another source provider.",
      tone: "info",
      icon: "search-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (state === "unsupported") {
    return {
      title: "No compatible source",
      message,
      detail:
        "The available sources do not match this device. More source providers may help.",
      tone: "warning",
      icon: "alert-circle-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (state === "ready" && errors.length > 0) {
    return {
      title:
        action === "download"
          ? "Download source failed"
          : action === "cast"
            ? "Cast source failed"
            : "Playback source failed",
      message: fallback,
      detail: attemptedDetail,
      tone: "warning",
      icon: "repeat-outline",
    };
  }

  return {
    title:
      action === "download"
        ? "Download unavailable"
        : action === "cast"
          ? "Casting unavailable"
          : "Playback unavailable",
    message,
    detail: attemptedDetail,
    tone: "warning",
    icon: "alert-circle-outline",
  };
}

export function getPlaybackReadinessCopyFromError(
  error: PlaybackRuntimeError,
  action: PlaybackAction,
  errors: string[] = [],
): PlaybackReadinessNoticeCopy {
  const attemptedDetail =
    errors.length > 0
      ? `Tried ${errors.length} source${errors.length === 1 ? "" : "s"}. ${errors[0]}`
      : undefined;

  if (error.code === "BRIDGE_UNAVAILABLE") {
    return {
      title: "Desktop bridge required",
      message: bridgeMessageForAction(error.message, action, false),
      detail:
        "Open Sources & Devices to connect this device to your desktop bridge.",
      tone: "warning",
      icon: "desktop-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (error.code === "BRIDGE_UNSUPPORTED") {
    return {
      title: "Bridge needs repair",
      message: bridgeMessageForAction(error.message, action, true),
      detail: `The app can see the bridge, but the torrent engine is not ready for ${actionNoun(action)}.`,
      tone: "error",
      icon: "construct-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (error.code === "NO_SOURCES") {
    return {
      title: "No sources yet",
      message: error.message,
      detail: "Try a different title or add another source provider.",
      tone: "info",
      icon: "search-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (error.code === "NO_PEERS") {
    return {
      title: "Source has no peers",
      message: error.message,
      detail: attemptedDetail || "Try again later or choose More Sources.",
      tone: "warning",
      icon: "people-outline",
    };
  }

  if (error.code === "UNSUPPORTED_CODEC") {
    return {
      title: "No compatible source",
      message: error.message,
      detail:
        "The selected source cannot play on this device without conversion.",
      tone: "warning",
      icon: "alert-circle-outline",
      primaryActionLabel: "Sources & Devices",
    };
  }

  if (error.code === "PLAYBACK_TIMEOUT" || error.code === "GATEWAY_TIMEOUT") {
    return {
      title: "Playback timed out",
      message: error.message,
      detail:
        attemptedDetail ||
        "The app can try another source when one is available.",
      tone: "warning",
      icon: "timer-outline",
    };
  }

  if (error.code === "NETWORK_OFFLINE") {
    return {
      title: "Network problem",
      message: error.message,
      detail: attemptedDetail,
      tone: "warning",
      icon: "cloud-offline-outline",
    };
  }

  return {
    title:
      action === "download"
        ? "Download unavailable"
        : action === "cast"
          ? "Casting unavailable"
          : "Playback unavailable",
    message: error.message,
    detail: attemptedDetail,
    tone: "warning",
    icon: "alert-circle-outline",
  };
}

export function PlaybackReadinessNotice({
  notice,
  onDismiss,
  onPrimaryAction,
}: {
  notice: PlaybackReadinessNoticeCopy;
  onDismiss: () => void;
  onPrimaryAction?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const toneColor =
    notice.tone === "error"
      ? colors.error
      : notice.tone === "warning"
        ? colors.warning
        : colors.tint;
  const foreground = isDark ? "#201528" : "#ffffff";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.74)",
          borderColor: toneColor + "66",
        },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: toneColor + "24" }]}>
        <Ionicons name={notice.icon} size={20} color={toneColor} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>
          {notice.title}
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {notice.message}
        </Text>
        {!!notice.detail && (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>
            {notice.detail}
          </Text>
        )}
        <View style={styles.actions}>
          {!!notice.primaryActionLabel && !!onPrimaryAction && (
            <Pressable
              style={[styles.primaryAction, { backgroundColor: toneColor }]}
              onPress={onPrimaryAction}
            >
              <Text style={[styles.primaryActionText, { color: foreground }]}>
                {notice.primaryActionLabel}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.dismissAction, { borderColor: colors.border }]}
            onPress={onDismiss}
          >
            <Text style={[styles.dismissText, { color: colors.text }]}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 38px rgba(44, 34, 54, 0.16)" }
      : {
          shadowColor: "#2c2236",
          shadowOpacity: 0.16,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 14 },
        }),
  } as any,
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
    opacity: 0.86,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  primaryAction: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryActionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  dismissAction: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dismissText: {
    fontSize: 12,
    fontWeight: "800",
  },
}) as any;
