import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { uiSpacing, uiTypography } from "./designSystem";

export function SectionHeader({
  title,
  eyebrow,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.copy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.62 }]}
        >
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>
            {actionLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textTertiary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: uiSpacing.lg,
  },
  copy: { flex: 1, gap: uiSpacing.xxs },
  eyebrow: { ...uiTypography.sectionLabel, textTransform: "uppercase" },
  title: { ...uiTypography.title, fontSize: 20, lineHeight: 26 },
  action: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
    paddingHorizontal: uiSpacing.sm,
  },
  actionText: { ...uiTypography.label },
});
