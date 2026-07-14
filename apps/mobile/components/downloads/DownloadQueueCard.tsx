import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import type { DownloadTask } from "../../stores/downloadStore";
import {
  getDownloadPrimaryAction,
  getDownloadSizeLabel,
  getDownloadStatusKey,
} from "./downloadPresentation";
import { AppButton } from "../ui/AppButton";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";
import { getDownloadRecovery } from "../../services/actionRecovery";

interface DownloadQueueCardProps {
  task: DownloadTask;
  busy?: boolean;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onVerify: () => void;
  onRepairBridge: () => void;
  onManageStorage: () => void;
  onDelete: () => void;
}

const STATUS_DEFAULTS: Record<string, string> = {
  queued: "Queued",
  preparing: "Preparing",
  downloading: "Downloading",
  verifying: "Verifying",
  paused: "Paused",
  checking: "Checking file",
  needsVerification: "Needs verification",
  readyOffline: "Ready offline",
  error: "Needs attention",
};

export function DownloadQueueCard({
  task,
  busy = false,
  onOpen,
  onPause,
  onResume,
  onRetry,
  onVerify,
  onRepairBridge,
  onManageStorage,
  onDelete,
}: DownloadQueueCardProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const primaryAction = getDownloadPrimaryAction(task);
  const recovery = getDownloadRecovery(task);
  const statusKey = getDownloadStatusKey(task);
  const sizeLabel = getDownloadSizeLabel(task);
  const progressPercent = `${Math.round(task.progress * 100)}%`;
  const episodeLabel =
    typeof task.mediaInfo.season === "number" &&
    typeof task.mediaInfo.episode === "number"
      ? `S${task.mediaInfo.season} E${task.mediaInfo.episode}`
      : task.mediaInfo.type === "series"
        ? t("downloads.card.series", { defaultValue: "Series" })
        : t("downloads.card.movie", { defaultValue: "Movie" });
  const statusLabel = t(`downloads.status.${statusKey}`, {
    defaultValue: STATUS_DEFAULTS[statusKey],
  });
  const isError = task.status === "Error";
  const isReady = statusKey === "readyOffline";
  const showProgress = [
    "Pending",
    "Preparing",
    "Downloading",
    "Verifying",
    "Paused",
  ].includes(task.status);
  const statusColor = isError
    ? colors.error
    : isReady
      ? colors.success
      : task.status === "Paused"
        ? colors.warning
        : colors.tint;
  const statusTone = isError
    ? "error"
    : isReady
      ? "success"
      : task.status === "Paused"
        ? "warning"
        : "info";
  const isWorking =
    busy ||
    task.status === "Pending" ||
    task.status === "Preparing" ||
    task.status === "Verifying";

  const runPrimaryAction = () => {
    if (primaryAction === "pause") onPause();
    if (primaryAction === "resume") onResume();
    if (primaryAction === "retry") onRetry();
    if (primaryAction === "replan") onRetry();
    if (primaryAction === "verify") onVerify();
    if (primaryAction === "repair_bridge") onRepairBridge();
    if (primaryAction === "free_storage") onManageStorage();
    if (primaryAction === "remove") onDelete();
    if (primaryAction === "play") onOpen();
  };

  const defaultPrimaryLabel =
    primaryAction === "pause"
      ? t("downloads.actions.pause", { defaultValue: "Pause" })
      : primaryAction === "resume"
        ? t("downloads.actions.resume", { defaultValue: "Resume" })
        : primaryAction === "retry" || primaryAction === "replan"
          ? t("downloads.actions.retry", { defaultValue: "Retry" })
          : primaryAction === "verify"
            ? t("downloads.actions.verify", { defaultValue: "Verify" })
            : t("downloads.actions.play", { defaultValue: "Play" });
  const primaryLabel = recovery?.actionLabel ?? defaultPrimaryLabel;
  const primaryIcon: keyof typeof Ionicons.glyphMap =
    primaryAction === "pause"
      ? "pause"
      : primaryAction === "retry" || primaryAction === "replan"
        ? "refresh"
        : primaryAction === "verify"
          ? "shield-checkmark-outline"
          : primaryAction === "repair_bridge"
            ? "construct-outline"
            : primaryAction === "free_storage"
              ? "folder-open-outline"
              : primaryAction === "remove"
                ? "trash-outline"
                : "play";
  const deleteActionLabel = t("downloads.actions.delete", {
    defaultValue: "Delete",
  });
  const deleteAccessibilityLabel = t("downloads.actions.deleteDownload", {
    defaultValue: "Delete download",
  });

  return (
    <Surface
      padded={false}
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          borderColor: isError ? colors.error + "50" : colors.border,
        },
      ]}
    >
      <Pressable
        style={styles.contentPressable}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.mediaInfo.title}. ${statusLabel}`}
      >
        <Image
          source={{ uri: task.mediaInfo.poster ?? undefined }}
          style={[styles.poster, compact && styles.posterCompact]}
        />
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <View style={styles.titleGroup}>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={2}
              >
                {task.mediaInfo.title ||
                  t("downloads.unknownTitle", { defaultValue: "Download" })}
              </Text>
              <Text
                style={[styles.metadata, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {episodeLabel}
                {sizeLabel ? `  ·  ${sizeLabel}` : ""}
              </Text>
            </View>
            <StatusPill label={statusLabel} tone={statusTone} />
          </View>

          {showProgress ? (
            <View style={styles.progressArea}>
              <View
                style={[
                  styles.progressTrack,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(40,34,54,0.08)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: progressPercent as `${number}%`,
                      backgroundColor: statusColor,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.progressText, { color: colors.textSecondary }]}
              >
                {task.status === "Downloading" ? progressPercent : statusLabel}
              </Text>
            </View>
          ) : null}

          {task.error ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.error + (isDark ? "16" : "12") },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={15}
                color={colors.error}
              />
              <Text
                style={[styles.errorText, { color: colors.error }]}
                numberOfLines={2}
              >
                {recovery?.message || task.error}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View
        style={[
          styles.actions,
          compact && styles.actionsCompact,
          { borderTopColor: colors.border },
        ]}
      >
        {isWorking ? (
          <View style={styles.workingState}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.workingText, { color: colors.textSecondary }]}>
              {statusLabel}
            </Text>
          </View>
        ) : primaryAction ? (
          <AppButton
            label={primaryLabel}
            icon={primaryIcon}
            variant={isReady ? "primary" : "secondary"}
            size="small"
            onPress={runPrimaryAction}
            disabled={busy}
          />
        ) : (
          <View />
        )}

        {primaryAction !== "remove" ? (
          <AppButton
            label={deleteActionLabel}
            accessibilityLabel={deleteAccessibilityLabel}
            icon="trash-outline"
            variant="danger"
            size="small"
            onPress={onDelete}
            disabled={busy}
          />
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: uiRadii.md,
    overflow: "hidden",
    minHeight: 162,
  },
  cardCompact: {
    minHeight: 132,
  },
  contentPressable: {
    flexDirection: "row",
    minWidth: 0,
  },
  poster: {
    width: 108,
    height: 162,
    backgroundColor: "rgba(127,127,127,0.12)",
  },
  posterCompact: {
    width: 82,
    height: 123,
  },
  info: {
    flex: 1,
    minWidth: 0,
    padding: uiSpacing.lg - 2,
    gap: uiSpacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiSpacing.md,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: 0,
  },
  metadata: {
    marginTop: 5,
    ...uiTypography.caption,
    fontWeight: "600",
  },
  progressArea: {
    gap: uiSpacing.xs + 2,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiSpacing.sm - 1,
    borderRadius: uiRadii.xs,
    paddingHorizontal: uiSpacing.sm + 1,
    paddingVertical: uiSpacing.sm,
  },
  errorText: {
    flex: 1,
    minWidth: 0,
    ...uiTypography.caption,
    fontWeight: "600",
  },
  actions: {
    minHeight: 52,
    borderTopWidth: 1,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.sm + 2,
  },
  actionsCompact: {
    minHeight: 48,
  },
  workingState: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  workingText: {
    ...uiTypography.caption,
  },
});
