import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlaybackPlanResponse } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpactLight } from "../../lib/haptics";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";
import { SourceChoiceList, useSourceChoicePlan } from "./SourceChoiceList";
import { TechnicalSourceDisclosure } from "./TechnicalSourceDisclosure";
import { AdaptiveOverlay } from "../ui/AdaptiveOverlay";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";

type MoreSourcesPanelProps = {
  contentId: string;
  title: string;
  sourceCount?: number;
  initiallyOpen?: boolean;
  onSelect: (plan: PlaybackPlanResponse, candidateId: string) => void;
};

export function MoreSourcesPanel({
  contentId,
  title,
  sourceCount = 0,
  initiallyOpen = false,
  onSelect,
}: MoreSourcesPanelProps) {
  const { colors } = useTheme();
  const { theme: cinematicTheme } = useCinematicTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: colors.borderSubtle,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          hapticImpactLight();
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          open ? t("detail.sources.hide") : t("detail.sources.show")
        }
        style={({ pressed, focused }: any) => [
          styles.header,
          pressed && { backgroundColor: colors.statePressed },
          Platform.OS === "web" &&
            focused &&
            getWebFocusStyle(cinematicTheme.focus),
        ]}
      >
        <View style={styles.heading}>
          <Ionicons
            name="layers-outline"
            size={17}
            color={colors.textSecondary}
          />
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t("detail.sources.playbackSource", {
                defaultValue: "Playback source",
              })}
            </Text>
            <Text style={[styles.summary, { color: colors.textSecondary }]}>
              {t("detail.sources.bestAvailable", {
                count: sourceCount,
                defaultValue: `Best available · ${sourceCount} sources`,
              })}
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      <AdaptiveOverlay
        visible={open}
        onClose={() => setOpen(false)}
        accessibilityLabel={t("detail.sources.more")}
        testID="more-sources-overlay"
        size="wide"
        placement="center"
        contentStyle={styles.overlay}
      >
        <View style={styles.overlayHeader}>
          <View>
            <Text style={[styles.overlayTitle, { color: colors.text }]}>
              {t("detail.sources.more")}
            </Text>
            <Text
              style={[styles.overlaySummary, { color: colors.textSecondary }]}
            >
              {t("detail.sources.bestAvailable", {
                count: sourceCount,
                defaultValue: `Best available · ${sourceCount} sources`,
              })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close", { defaultValue: "Close" })}
            onPress={() => setOpen(false)}
            style={({ pressed, focused }: any) => [
              styles.closeButton,
              pressed && { opacity: 0.68 },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(cinematicTheme.focus),
            ]}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        {open ? (
          <MoreSourcesBody
            contentId={contentId}
            title={title}
            onSelect={onSelect}
          />
        ) : null}
      </AdaptiveOverlay>
    </View>
  );
}

function MoreSourcesBody({
  contentId,
  title,
  onSelect,
}: Pick<MoreSourcesPanelProps, "contentId" | "title" | "onSelect">) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sourceState = useSourceChoicePlan({
    contentType: "movie",
    contentId,
  });

  return (
    <View style={styles.body}>
      {!sourceState.loading && !sourceState.error ? (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {t("detail.sources.available", {
            count: sourceState.choices.length,
          })}
        </Text>
      ) : null}
      <SourceChoiceList state={sourceState} onSelect={onSelect} />
      <TechnicalSourceDisclosure
        contentType="movie"
        contentId={contentId}
        title={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: uiSpacing.xs,
    paddingVertical: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: uiSpacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...uiTypography.control },
  summary: { ...uiTypography.caption },
  meta: { ...uiTypography.caption, marginTop: 2 },
  overlay: { width: "100%" },
  overlayHeader: {
    minHeight: 68,
    paddingHorizontal: uiSpacing.xl,
    paddingVertical: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.lg,
  },
  overlayTitle: { ...uiTypography.title, fontSize: 20, lineHeight: 26 },
  overlaySummary: { ...uiTypography.caption, marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiRadii.pill,
  },
  body: { padding: uiSpacing.xl, paddingTop: uiSpacing.sm, gap: uiSpacing.lg },
});
