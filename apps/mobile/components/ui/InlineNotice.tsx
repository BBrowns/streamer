import type { ComponentProps } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "./AppButton";
import { Surface } from "./Surface";
import {
  getToneColor,
  type StatusTone,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "./designSystem";

export type InlineNoticeTone = Extract<
  StatusTone,
  "success" | "warning" | "error" | "info"
>;

type InlineNoticeProps = {
  tone: InlineNoticeTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const toneIcons: Record<
  InlineNoticeTone,
  ComponentProps<typeof Ionicons>["name"]
> = {
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  error: "alert-circle-outline",
  info: "information-circle-outline",
};

const surfaceVariants: Record<
  InlineNoticeTone,
  "accent" | "warning" | "danger"
> = {
  success: "accent",
  warning: "warning",
  error: "danger",
  info: "accent",
};

export function InlineNotice({
  tone,
  message,
  actionLabel,
  onAction,
  testID,
  style,
}: InlineNoticeProps) {
  const { colors } = useTheme();
  const isError = tone === "error";

  return (
    <View
      testID={testID}
      accessibilityRole={isError ? "alert" : "text"}
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      style={style}
    >
      <Surface
        variant={surfaceVariants[tone]}
        padded={false}
        style={styles.notice}
      >
        <Ionicons
          name={toneIcons[tone]}
          size={18}
          color={getToneColor(colors, tone)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        {!!actionLabel && !!onAction ? (
          <AppButton
            label={actionLabel}
            size="small"
            variant="ghost"
            onPress={onAction}
          />
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    minHeight: uiTouchTarget,
    paddingVertical: uiSpacing.sm,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  message: {
    ...uiTypography.body,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
