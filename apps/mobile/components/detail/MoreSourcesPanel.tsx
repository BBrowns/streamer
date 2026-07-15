import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlaybackPlan } from "@streamer/shared";
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

type MoreSourcesPanelProps = {
  contentId: string;
  title: string;
  initiallyOpen?: boolean;
  onSelect: (plan: PlaybackPlan, candidateId: string) => void;
};

export function MoreSourcesPanel({
  contentId,
  title,
  initiallyOpen = false,
  onSelect,
}: MoreSourcesPanelProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
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
          pressed && { backgroundColor: colors.surfaceElevated },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
      >
        <View style={styles.heading}>
          <Ionicons name="layers-outline" size={18} color={colors.tint} />
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t("detail.sources.more")}
            </Text>
          </View>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      {open ? (
        <MoreSourcesBody
          contentId={contentId}
          title={title}
          onSelect={onSelect}
        />
      ) : null}
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
  container: { borderRadius: uiRadii.card, overflow: "hidden" },
  header: {
    minHeight: 68,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: uiSpacing.md },
  title: { ...uiTypography.control },
  meta: { ...uiTypography.caption, marginTop: 2 },
  body: { padding: uiSpacing.lg, paddingTop: uiSpacing.sm, gap: uiSpacing.lg },
});
