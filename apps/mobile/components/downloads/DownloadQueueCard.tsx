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

interface DownloadQueueCardProps {
  task: DownloadTask;
  busy?: boolean;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDelete: () => void;
}

const STATUS_DEFAULTS: Record<string, string> = {
  queued: "Queued",
  preparing: "Preparing",
  downloading: "Downloading",
  verifying: "Verifying",
  paused: "Paused",
  checking: "Checking file",
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
  onDelete,
}: DownloadQueueCardProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const primaryAction = getDownloadPrimaryAction(task);
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
    if (primaryAction === "play") onOpen();
  };

  const primaryLabel =
    primaryAction === "pause"
      ? t("downloads.actions.pause", { defaultValue: "Pause" })
      : primaryAction === "resume"
        ? t("downloads.actions.resume", { defaultValue: "Resume" })
        : primaryAction === "retry"
          ? t("downloads.actions.retry", { defaultValue: "Retry" })
          : t("downloads.actions.play", { defaultValue: "Play" });
  const primaryIcon: keyof typeof Ionicons.glyphMap =
    primaryAction === "pause"
      ? "pause"
      : primaryAction === "retry"
        ? "refresh"
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
                {task.error}
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

        <AppButton
          label={deleteActionLabel}
          accessibilityLabel={deleteAccessibilityLabel}
          icon="trash-outline"
          variant="danger"
          size="small"
          onPress={onDelete}
          disabled={busy}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
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
    padding: 14,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0,
  },
  progressArea: {
    gap: 6,
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
    gap: 7,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0,
  },
  actions: {
    minHeight: 52,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  actionsCompact: {
    minHeight: 48,
  },
  workingState: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workingText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
});
