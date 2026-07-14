import { Children, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle } from "../ui/designSystem";
import { AppSwitch } from "../ui/AppSwitch";
import type { SettingsSectionDefinition } from "./settingsSections";

type RowBaseProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

function RowText({
  title,
  subtitle,
  destructive = false,
}: Pick<RowBaseProps, "title" | "subtitle" | "destructive">) {
  const { colors } = useTheme();

  return (
    <View style={styles.textColumn}>
      <Text
        style={[
          styles.title,
          { color: destructive ? colors.error : colors.text },
        ]}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function RowIcon({
  icon,
  destructive = false,
}: Pick<RowBaseProps, "icon" | "destructive">) {
  const { colors } = useTheme();
  if (!icon) return null;

  return (
    <View style={styles.icon}>
      <Ionicons
        name={icon}
        size={21}
        color={destructive ? colors.error : colors.textSecondary}
      />
    </View>
  );
}

export function SettingsNavRow({
  section,
  title,
  subtitle,
  selected = false,
  compact = false,
  onPress,
}: {
  section: SettingsSectionDefinition;
  title: string;
  subtitle?: string;
  selected?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={`settings-category-${section.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ focused, pressed }: any) => [
        styles.row,
        compact ? styles.compactRow : styles.overviewRow,
        selected && { backgroundColor: colors.tint + "16" },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <RowIcon icon={section.icon} />
      <RowText title={title} subtitle={compact ? undefined : subtitle} />
      <Ionicons
        name={selected && compact ? "checkmark" : "chevron-forward"}
        size={18}
        color={selected ? colors.tint : colors.textSecondary}
      />
    </Pressable>
  );
}

export function SettingsActionRow({
  title,
  subtitle,
  icon,
  destructive = false,
  disabled = false,
  loading = false,
  onPress,
  trailing,
  testID,
}: RowBaseProps & {
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ focused, pressed }: any) => [
        styles.row,
        styles.actionRow,
        disabled && styles.disabled,
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <RowIcon icon={icon} destructive={destructive} />
      <RowText title={title} subtitle={subtitle} destructive={destructive} />
      {loading ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        (trailing ?? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        ))
      )}
    </Pressable>
  );
}

export function SettingsToggleRow({
  title,
  subtitle,
  icon,
  value,
  disabled = false,
  onValueChange,
  testID,
}: RowBaseProps & {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View
      testID={testID}
      style={[styles.row, styles.actionRow, disabled && styles.disabled]}
    >
      <RowIcon icon={icon} />
      <RowText title={title} subtitle={subtitle} />
      <AppSwitch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={title}
      />
    </View>
  );
}

export function SettingsChoiceRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  testID,
  children,
}: RowBaseProps & {
  value?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const { colors } = useTheme();

  if (children) {
    return (
      <View
        testID={testID}
        style={[styles.row, styles.actionRow, styles.choiceControlRow]}
      >
        <View style={styles.choiceHeader}>
          <RowIcon icon={icon} />
          <RowText title={title} subtitle={subtitle} />
        </View>
        <View style={styles.choiceControl}>{children}</View>
      </View>
    );
  }

  return (
    <SettingsActionRow
      testID={testID}
      title={title}
      subtitle={subtitle}
      icon={icon}
      onPress={onPress ?? (() => {})}
      trailing={
        <View style={styles.choiceTrailing}>
          <Text style={[styles.choiceValue, { color: colors.textSecondary }]}>
            {value}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </View>
      }
    />
  );
}

export function SettingsRowGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const items = Children.toArray(children);

  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {items.map((child, index) => (
        <View key={index}>
          {index > 0 && (
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
          )}
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
  },
  overviewRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
  },
  compactRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionRow: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
  },
  icon: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  textColumn: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  choiceTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  choiceControlRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  choiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  choiceControl: { width: "100%" },
  choiceValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.68,
  },
  disabled: {
    opacity: 0.45,
  },
});
