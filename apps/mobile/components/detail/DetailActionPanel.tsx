import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { AppButton } from "../ui/AppButton";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { useTranslation } from "react-i18next";

type DetailActionPanelProps = {
  castType: "movie" | "series";
  sourceCount: number;
  episodeCount?: number;
  streamsLoading?: boolean;
  hasPlayableSources: boolean;
  inLibrary: boolean;
  planningAction?: "play" | "download" | "cast" | null;
  onPlayBest: () => void;
  onDownload: () => void;
  onCast?: () => void;
  onToggleLibrary: () => void;
  style?: StyleProp<ViewStyle>;
};

export function DetailActionPanel({
  castType,
  sourceCount,
  episodeCount = 0,
  streamsLoading = false,
  hasPlayableSources,
  inLibrary,
  planningAction,
  onPlayBest,
  onDownload,
  onCast,
  onToggleLibrary,
  style,
}: DetailActionPanelProps) {
  const { t } = useTranslation();
  const isMovie = castType !== "series";
  const actionDisabled = !!planningAction;
  const sourceLabel = isMovie
    ? streamsLoading
      ? t("detail.actionPanel.findingSources")
      : sourceCount > 0
        ? t("detail.actionPanel.sourceCount", { count: sourceCount })
        : t("detail.actionPanel.noSources")
    : t("detail.actionPanel.episodeCount", { count: episodeCount });
  const sourceTone = isMovie
    ? streamsLoading
      ? "warning"
      : sourceCount > 0
        ? "success"
        : "warning"
    : episodeCount > 0
      ? "info"
      : "warning";

  return (
    <Surface variant="plain" padded={false} style={[styles.panel, style]}>
      <View style={styles.statusRow}>
        <StatusPill
          label={sourceLabel}
          tone={sourceTone}
          icon={isMovie ? "sparkles-outline" : "albums-outline"}
        />
      </View>

      <View style={styles.actionRow}>
        {isMovie ? (
          <>
            <AppButton
              label={
                planningAction === "play"
                  ? t("detail.actionPanel.findingBest")
                  : t("detail.actionPanel.playBest")
              }
              icon="play"
              variant="primary"
              size="large"
              disabled={!hasPlayableSources || actionDisabled}
              loading={planningAction === "play"}
              onPress={onPlayBest}
              style={styles.primaryButton}
            />
            <AppButton
              label={
                planningAction === "download"
                  ? t("detail.actionPanel.preparing")
                  : t("detail.download")
              }
              icon="download-outline"
              variant="secondary"
              size="large"
              disabled={!hasPlayableSources || actionDisabled}
              loading={planningAction === "download"}
              onPress={onDownload}
              style={styles.secondaryButton}
            />
            {onCast ? (
              <AppButton
                label={
                  planningAction === "cast"
                    ? t("detail.actionPanel.preparing")
                    : t("detail.cast")
                }
                icon="tv-outline"
                variant="secondary"
                size="large"
                disabled={!hasPlayableSources || actionDisabled}
                loading={planningAction === "cast"}
                onPress={onCast}
                style={styles.secondaryButton}
              />
            ) : null}
          </>
        ) : null}

        <AppButton
          label={
            inLibrary
              ? t("detail.actionPanel.inLibrary")
              : t("detail.actionPanel.add")
          }
          icon={inLibrary ? "checkmark" : "add"}
          variant="secondary"
          size="large"
          onPress={onToggleLibrary}
          style={styles.secondaryButton}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
    marginBottom: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    flexGrow: 1,
    flexBasis: 190,
  },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: 124,
  },
});
