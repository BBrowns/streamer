import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackRuntimeError,
} from "@streamer/shared";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "../ui/AppButton";
import { uiRadii, uiTypography } from "../ui/designSystem";
import { useTranslation } from "react-i18next";
import i18n from "../../lib/i18n";

export type PlaybackReadinessTone = "info" | "warning" | "error";
export type PlaybackReadinessActionTarget =
  | "sourcesDevices"
  | "playbackSettings";

export interface PlaybackReadinessNoticeCopy {
  title: string;
  message: string;
  detail?: string;
  tone: PlaybackReadinessTone;
  icon: keyof typeof Ionicons.glyphMap;
  primaryActionLabel?: string;
  primaryActionTarget?: PlaybackReadinessActionTarget;
}

export function getPlaybackReadinessRoute(
  target: PlaybackReadinessActionTarget,
): "/settings/playback" | "/settings/sources" {
  return target === "playbackSettings"
    ? "/settings/playback"
    : "/settings/sources";
}

function readinessCopy(
  key: string,
  options?: Record<string, string | number>,
): string {
  return i18n.t(key, options) as string;
}

function actionCopy(group: string, action: PlaybackAction) {
  return readinessCopy(`detail.readiness.${group}.${action}`);
}

function setupMessage(action: PlaybackAction, needsAttention = false) {
  return actionCopy(needsAttention ? "setupNeedsAttention" : "setup", action);
}

function attemptedOptionsCopy(errors: string[]) {
  return errors.length > 0
    ? readinessCopy("detail.readiness.attemptedOptions", {
        count: errors.length,
      })
    : undefined;
}

function isQualitySelectionExclusion(plan: PlaybackPlan | null): boolean {
  return (
    plan?.state === "unsupported" &&
    plan.rejectedCandidates.length > 0 &&
    plan.rejectedCandidates.every(
      (candidate) => candidate.reasonCode === "quality_not_allowed",
    )
  );
}

function qualitySelectionCopy(): PlaybackReadinessNoticeCopy {
  return {
    title: readinessCopy("detail.readiness.qualitySelectionTitle"),
    message: readinessCopy("detail.readiness.qualitySelectionMessage"),
    detail: readinessCopy("detail.readiness.qualitySelectionDetail"),
    tone: "info",
    icon: "options-outline",
    primaryActionLabel: readinessCopy(
      "detail.readiness.playbackSettingsAction",
    ),
    primaryActionTarget: "playbackSettings",
  };
}

export function getPlaybackReadinessCopy(
  plan: PlaybackPlan | null,
  fallback: string,
  action: PlaybackAction,
  errors: string[] = [],
): PlaybackReadinessNoticeCopy {
  const state = plan?.state;
  const message = plan?.userMessage || fallback;
  const attemptedDetail = attemptedOptionsCopy(errors);

  if (isQualitySelectionExclusion(plan)) {
    return qualitySelectionCopy();
  }

  if (state === "needsBridge") {
    return {
      title: readinessCopy("detail.readiness.finishSetupTitle"),
      message: setupMessage(action),
      detail: readinessCopy("detail.readiness.openSourcesDetail"),
      tone: "warning",
      icon: "desktop-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (state === "bridgeUnavailable") {
    return {
      title: readinessCopy("detail.readiness.setupAttentionTitle"),
      message: setupMessage(action, true),
      detail: readinessCopy("detail.readiness.directMayWork"),
      tone: "error",
      icon: "construct-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (state === "needsTranscode") {
    return {
      title: readinessCopy("detail.readiness.extraSupportTitle"),
      message: readinessCopy("detail.readiness.extraSupportMessage"),
      detail: readinessCopy("detail.readiness.checkSupportDetail"),
      tone: "warning",
      icon: "sync-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (state === "notFound") {
    return {
      title: readinessCopy("detail.readiness.noSourcesTitle"),
      message: readinessCopy("detail.readiness.noSourcesMessage"),
      detail: readinessCopy("detail.readiness.noSourcesDetail"),
      tone: "info",
      icon: "search-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (state === "unsupported") {
    return {
      title: readinessCopy("detail.readiness.noCompatibleTitle"),
      message: readinessCopy("detail.readiness.noCompatibleMessage"),
      detail: readinessCopy("detail.readiness.noCompatibleDetail"),
      tone: "warning",
      icon: "alert-circle-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (state === "ready" && errors.length > 0) {
    return {
      title: actionCopy("sourceFailed", action),
      message: fallback,
      detail: attemptedDetail,
      tone: "warning",
      icon: "repeat-outline",
    };
  }

  return {
    title: actionCopy("unavailable", action),
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
  const attemptedDetail = attemptedOptionsCopy(errors);

  if (error.reasonCode === "quality_not_allowed") {
    return qualitySelectionCopy();
  }

  if (error.code === "BRIDGE_UNAVAILABLE") {
    return {
      title: readinessCopy("detail.readiness.finishSetupTitle"),
      message: setupMessage(action),
      detail: readinessCopy("detail.readiness.openSourcesDetail"),
      tone: "warning",
      icon: "desktop-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (error.code === "BRIDGE_UNSUPPORTED") {
    return {
      title: readinessCopy("detail.readiness.setupAttentionTitle"),
      message: setupMessage(action, true),
      detail: readinessCopy("detail.readiness.directMayWork"),
      tone: "error",
      icon: "construct-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (error.code === "NO_SOURCES") {
    return {
      title: readinessCopy("detail.readiness.noSourcesTitle"),
      message: readinessCopy("detail.readiness.noSourcesMessage"),
      detail: readinessCopy("detail.readiness.noSourcesDetail"),
      tone: "info",
      icon: "search-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (error.code === "NO_PEERS") {
    return {
      title: readinessCopy("detail.readiness.optionUnavailableTitle"),
      message: readinessCopy("detail.readiness.optionCouldNotStart"),
      detail:
        attemptedDetail || readinessCopy("detail.readiness.tryAgainOrMore"),
      tone: "warning",
      icon: "people-outline",
    };
  }

  if (error.code === "UNSUPPORTED_CODEC") {
    return {
      title: readinessCopy("detail.readiness.noCompatibleTitle"),
      message: readinessCopy("detail.readiness.optionCannotPlay"),
      detail: readinessCopy("detail.readiness.tryAnotherOption"),
      tone: "warning",
      icon: "alert-circle-outline",
      primaryActionLabel: readinessCopy("detail.readiness.sourcesAction"),
      primaryActionTarget: "sourcesDevices",
    };
  }

  if (error.code === "PLAYBACK_TIMEOUT" || error.code === "GATEWAY_TIMEOUT") {
    return {
      title: readinessCopy("detail.readiness.timeoutTitle"),
      message: readinessCopy("detail.readiness.timeoutMessage"),
      detail:
        attemptedDetail || readinessCopy("detail.readiness.timeoutDetail"),
      tone: "warning",
      icon: "timer-outline",
    };
  }

  if (error.code === "NETWORK_OFFLINE") {
    return {
      title: readinessCopy("detail.readiness.networkTitle"),
      message: readinessCopy("detail.readiness.networkMessage"),
      detail: attemptedDetail,
      tone: "warning",
      icon: "cloud-offline-outline",
    };
  }

  return {
    title: actionCopy("unavailable", action),
    message: readinessCopy("detail.readiness.unavailableMessage"),
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
  onPrimaryAction?: (target: PlaybackReadinessActionTarget) => void;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const toneColor =
    notice.tone === "error"
      ? colors.error
      : notice.tone === "warning"
        ? colors.warning
        : colors.tint;

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
          {!!notice.primaryActionLabel &&
            !!notice.primaryActionTarget &&
            !!onPrimaryAction && (
              <AppButton
                label={notice.primaryActionLabel}
                variant="primary"
                size="small"
                onPress={() => onPrimaryAction(notice.primaryActionTarget!)}
              />
            )}
          <AppButton
            label={t("common.dismiss")}
            variant="ghost"
            size="small"
            onPress={onDismiss}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: uiRadii.card,
    padding: 16,
    flexDirection: "row",
    gap: 12,
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
    ...uiTypography.label,
    fontSize: 15,
    marginBottom: 4,
  },
  message: {
    ...uiTypography.label,
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
}) as any;
