import { Platform, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "./AppButton";
import { uiLayout, uiRadii, uiSpacing, uiTypography } from "./designSystem";

type SelectionActionBarProps = {
  selectedCount: number;
  selectedLabel: string;
  actionLabel: string;
  actionAccessibilityLabel?: string;
  onAction: () => void;
  busy?: boolean;
};

export function SelectionActionBar({
  selectedCount,
  selectedLabel,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  busy = false,
}: SelectionActionBarProps) {
  const { colors, isDark } = useTheme();
  if (selectedCount <= 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.positioner}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            boxShadow:
              Platform.OS === "web"
                ? isDark
                  ? "0 16px 36px rgba(0,0,0,0.48)"
                  : "0 16px 36px rgba(16,18,22,0.18)"
                : undefined,
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.count, { color: colors.text }]}>
          {selectedLabel}
        </Text>
        <AppButton
          label={actionLabel}
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          icon="trash-outline"
          variant="danger"
          size="small"
          onPress={onAction}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: uiSpacing.lg,
    right: uiSpacing.lg,
    bottom: Platform.OS === "ios" ? uiSpacing.xxl : uiSpacing.lg,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    maxWidth: uiLayout.readingMaxWidth,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: uiRadii.lg,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
    elevation: 10,
  } as any,
  count: {
    ...uiTypography.control,
    flex: 1,
  },
});
