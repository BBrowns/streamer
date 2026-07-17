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
import { getWebAriaChecked, getWebFocusStyle } from "../ui/designSystem";
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

export function SettingsMultiSelectRow<T extends string>({
  title,
  subtitle,
  icon,
  options,
  selectedValues,
  onToggle,
  testID,
}: RowBaseProps & {
  options: Array<{ label: string; value: T; disabled?: boolean }>;
  selectedValues: readonly T[];
  onToggle: (value: T) => void;
}) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.row, styles.actionRow, styles.choiceControlRow]}
    >
      <View style={styles.choiceHeader}>
        <RowIcon icon={icon} />
        <RowText title={title} subtitle={subtitle} />
      </View>
      <View
        style={[
          styles.multiSelect,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.border,
          },
        ]}
      >
        {options.map((option, index) => {
          const selected = selectedValues.includes(option.value);
          return (
            <View key={option.value}>
              {index > 0 && (
                <View
                  style={[
                    styles.multiSelectDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
              )}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={option.label}
                accessibilityState={{
                  checked: selected,
                  disabled: option.disabled,
                }}
                {...getWebAriaChecked(selected)}
                disabled={option.disabled}
                onPress={() => onToggle(option.value)}
                style={({ focused, pressed }: any) => [
                  styles.multiSelectOption,
                  selected && { backgroundColor: colors.tint + "0D" },
                  option.disabled && styles.disabled,
                  pressed && styles.pressed,
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
              >
                <Text
                  style={[
                    styles.multiSelectLabel,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={23}
                  color={selected ? colors.tint : colors.textSecondary}
                />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsRadioRow({
  title,
  subtitle,
  selected,
  onPress,
  testID,
}: Pick<RowBaseProps, "title" | "subtitle" | "testID"> & {
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      {...getWebAriaChecked(selected)}
      onPress={onPress}
      style={({ focused, pressed }: any) => [
        styles.row,
        styles.radioRow,
        selected && { backgroundColor: colors.tint + "12" },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <RowText title={title} subtitle={subtitle} />
      <View
        style={[
          styles.radioIndicator,
          {
            borderColor: selected ? colors.tint : colors.border,
            backgroundColor: selected ? colors.tint : "transparent",
          },
        ]}
      >
        {selected && (
          <Ionicons name="checkmark" size={16} color={colors.onTint} />
        )}
      </View>
    </Pressable>
  );
}

export function SettingsInfoRow({
  title,
  value,
  testID,
}: {
  title: string;
  value: string;
  testID?: string;
}) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={[styles.row, styles.infoRow]}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
        {title}
      </Text>
      <Text
        selectable
        numberOfLines={2}
        style={[styles.infoValue, { color: colors.text }]}
      >
        {value}
      </Text>
    </View>
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
  radioRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 0,
  },
  radioIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  infoValue: {
    flex: 1.4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "right",
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
  multiSelect: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: "hidden",
  },
  multiSelectOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  multiSelectLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  multiSelectDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 12,
  },
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
