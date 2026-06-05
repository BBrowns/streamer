import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { AppButton } from "../ui/AppButton";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";

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
  const isMovie = castType !== "series";
  const actionDisabled = !!planningAction;
  const sourceLabel = isMovie
    ? streamsLoading
      ? "Finding sources"
      : sourceCount > 0
        ? `${sourceCount} sources`
        : "No sources"
    : `${episodeCount} episodes`;
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
    <Surface variant="accent" style={[styles.panel, style]}>
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
                planningAction === "play" ? "Finding best..." : "Play Best"
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
                planningAction === "download" ? "Preparing..." : "Download"
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
                label={planningAction === "cast" ? "Preparing..." : "Cast"}
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
          label={inLibrary ? "In Library" : "Add"}
          icon={inLibrary ? "checkmark" : "add"}
          variant={inLibrary ? "primary" : "secondary"}
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
