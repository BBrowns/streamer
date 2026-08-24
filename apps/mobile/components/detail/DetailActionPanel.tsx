import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { AppButton } from "../ui/AppButton";
import { Surface } from "../ui/Surface";
import { useTranslation } from "react-i18next";
import { useWindowClass } from "../../hooks/useWindowClass";

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
  focusColor?: string;
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
  focusColor,
  style,
}: DetailActionPanelProps) {
  const { t } = useTranslation();
  const { isCompact } = useWindowClass();
  const isMovie = castType !== "series";
  const actionDisabled = !!planningAction;

  return (
    <Surface variant="plain" padded={false} style={[styles.panel, style]}>
      {isMovie ? (
        <View testID="detail-primary-actions" style={styles.primaryRow}>
          <AppButton
            label={
              planningAction === "play"
                ? t("detail.actionPanel.findingBest")
                : t("common.actions.play", { defaultValue: "Play" })
            }
            icon="play"
            variant="primary"
            size="large"
            disabled={actionDisabled}
            loading={planningAction === "play"}
            onPress={onPlayBest}
            onFocus={onPlayIntent}
            onHoverIn={onPlayIntent}
            focusColor={focusColor}
            fullWidth={isCompact}
            style={styles.primaryButton}
          />
        </View>
      ) : null}

      <View
        testID="detail-secondary-actions"
        style={[styles.secondaryRow, isCompact && styles.secondaryRowCompact]}
      >
        {isMovie ? (
          <AppButton
            label={
              planningAction === "download"
                ? t("detail.actionPanel.preparing")
                : t("detail.download")
            }
            icon="download-outline"
            variant="secondary"
            size="small"
            disabled={actionDisabled}
            loading={planningAction === "download"}
            onPress={onDownload}
            focusColor={focusColor}
            style={styles.secondaryButton}
          />
        ) : null}
        {isMovie && onCast ? (
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
            size="small"
            disabled={actionDisabled}
            loading={planningAction === "cast"}
            onPress={onCast}
            focusColor={focusColor}
            style={styles.secondaryButton}
          />
        ) : null}
        {hasTrailer && onWatchTrailer ? (
          <AppButton
            label={t("detail.actionPanel.watchTrailer")}
            icon="play-circle-outline"
            variant="secondary"
            size="small"
            onPress={onWatchTrailer}
            focusColor={focusColor}
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
          size="small"
          onPress={onToggleLibrary}
          focusColor={focusColor}
          style={styles.secondaryButton}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
    marginBottom: 18,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  primaryButton: {
    minWidth: 190,
  },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  secondaryRowCompact: { gap: 6 },
  secondaryButton: {
    flexGrow: 0,
  },
});
