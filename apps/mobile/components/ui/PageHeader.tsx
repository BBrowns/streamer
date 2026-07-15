import type { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { uiSpacing, uiTypography } from "./designSystem";

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  compact = false,
  style,
}: PageHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, compact && styles.headerCompact, style]}>
      <View style={styles.copy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          style={[
            compact ? styles.compactTitle : styles.title,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: uiSpacing.xxl,
    marginBottom: uiSpacing.xxxl,
  },
  headerCompact: {
    marginBottom: uiSpacing.lg,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    maxWidth: 760,
  },
  eyebrow: {
    ...uiTypography.sectionLabel,
    textTransform: "uppercase",
    marginBottom: uiSpacing.sm,
  },
  title: {
    ...uiTypography.headline,
  },
  compactTitle: {
    ...uiTypography.title,
  },
  description: {
    ...uiTypography.body,
    marginTop: uiSpacing.sm,
    maxWidth: 640,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
  },
});
