import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { AppButton } from "../ui/AppButton";
import { Surface } from "../ui/Surface";
import { useTranslation } from "react-i18next";

type DetailActionPanelProps = {
  castType: "movie" | "series";
  sourceCount: number;
  episodeCount?: number;
  streamsLoading?: boolean;
  hasPlayableSources: boolean;
  inLibrary: boolean;
  hasTrailer?: boolean;
  planningAction?: "play" | "download" | "cast" | null;
  onPlayBest: () => void;
  onPlayIntent?: () => void;
  onDownload: () => void;
  onCast?: () => void;
  onToggleLibrary: () => void;
  onWatchTrailer?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function DetailActionPanel({
  castType,
  hasPlayableSources: _hasPlayableSources,
  inLibrary,
  hasTrailer = false,
  planningAction,
  onPlayBest,
  onPlayIntent,
  onDownload,
  onCast,
  onToggleLibrary,
  onWatchTrailer,
  style,
}: DetailActionPanelProps) {
  const { t } = useTranslation();
  const isMovie = castType !== "series";
  const actionDisabled = !!planningAction;

  return (
    <Surface variant="plain" padded={false} style={[styles.panel, style]}>
      <View style={styles.actionRow}>
        {isMovie ? (
          <>
            <AppButton
              label={
                planningAction === "play"
                  ? t("detail.actionPanel.findingBest")
                  : t("common.actions.play", { defaultValue: "Play" })
              }
              icon="play"
              variant="primary"
              size="large"
              // The planner is authoritative. A raw stream list can still be
              // loading or contain only a fast partial response, so it must
              // not disable Play before the planner has had a chance to find
              // a playable source.
              disabled={actionDisabled}
              loading={planningAction === "play"}
              onPress={onPlayBest}
              onFocus={onPlayIntent}
              onHoverIn={onPlayIntent}
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
              disabled={actionDisabled}
              loading={planningAction === "download"}
              onPress={onDownload}
              style={styles.secondaryButton}
            />
            {onCast ? (
              <AppButton
                label={
                  planningAction === "cast"
                    ? t("detail.actionPanel.preparing")
                    : t("common.actions.castToDevice", {
                        defaultValue: "Cast to device",
                      })
                }
                icon="tv-outline"
                variant="secondary"
                size="large"
                disabled={actionDisabled}
                loading={planningAction === "cast"}
                onPress={onCast}
                style={styles.secondaryButton}
              />
            ) : null}
          </>
        ) : null}

        {hasTrailer && onWatchTrailer ? (
          <AppButton
            label={t("detail.actionPanel.watchTrailer")}
            icon="play-circle-outline"
            variant="secondary"
            size="large"
            onPress={onWatchTrailer}
            style={styles.secondaryButton}
          />
        ) : null}

        <AppButton
          label={
            inLibrary
              ? t("detail.actionPanel.inLibrary")
              : t("common.actions.addToLibrary", {
                  defaultValue: "Add to Library",
                })
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
