import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle, uiSpacing, uiTypography } from "../ui/designSystem";
import { SourceInspectorPanel } from "./SourceInspectorPanel";

type TechnicalSourceDisclosureProps = {
  contentType: "movie" | "series";
  contentId: string;
  title?: string;
  season?: number;
  episode?: number;
};

export function TechnicalSourceDisclosure(
  props: TechnicalSourceDisclosureProps,
) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t(
          open ? "detail.sources.hideTechnical" : "detail.sources.technical",
          {
            defaultValue: open
              ? "Hide technical details"
              : "Show technical details",
          },
        )}
        style={({ pressed, focused }: any) => [
          styles.button,
          pressed && styles.pressed,
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t(
            open ? "detail.sources.hideTechnical" : "detail.sources.technical",
            {
              defaultValue: open
                ? "Hide technical details"
                : "Show technical details",
            },
          )}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={17}
          color={colors.textSecondary}
        />
      </Pressable>
      {open ? <SourceInspectorPanel {...props} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: uiSpacing.sm },
  button: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
  },
  label: { ...uiTypography.label },
  pressed: { opacity: 0.7 },
});
