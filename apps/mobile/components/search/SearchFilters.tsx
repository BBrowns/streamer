import React, { useCallback, useRef } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import type { SearchSort } from "../../services/searchState";
import { getWebFocusStyle } from "../ui/designSystem";

export interface SearchFilterOption<T extends string = string> {
  label: string;
  value: T;
}

export function getRadioNavigationIndex(
  currentIndex: number,
  optionCount: number,
  key: string,
) {
  if (optionCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") {
    return (currentIndex + 1) % optionCount;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (currentIndex - 1 + optionCount) % optionCount;
  }
  return null;
}

interface SearchFilterControlsProps {
  years: SearchFilterOption[];
  providers: SearchFilterOption[];
  year: string;
  provider: string;
  sort: SearchSort;
  onYearChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onSortChange: (value: SearchSort) => void;
  onReset: () => void;
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SearchFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const choiceRefs = useRef<any[]>([]);
  const handleChoiceKeyDown = useCallback(
    (event: any, currentIndex: number) => {
      const key = event.nativeEvent?.key ?? event.key;
      const nextIndex = getRadioNavigationIndex(
        currentIndex,
        options.length,
        key,
      );
      if (nextIndex === null) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      const nextOption = options[nextIndex];
      if (!nextOption) return true;
      onChange(nextOption.value);
      choiceRefs.current[nextIndex]?.focus?.();
      return true;
    },
    [onChange, options],
  );
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View
        style={styles.choices}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {options.map((option, index) => (
          <ChoiceRow
            key={option.value}
            option={option}
            selected={option.value === value}
            onChange={onChange}
            onKeyDown={(event) => handleChoiceKeyDown(event, index)}
            registerRef={(node) => {
              choiceRefs.current[index] = node;
            }}
          />
        ))}
      </View>
    </View>
  );
}

function ChoiceRow<T extends string>({
  option,
  selected,
  onChange,
  onKeyDown,
  registerRef,
}: {
  option: SearchFilterOption<T>;
  selected: boolean;
  onChange: (value: T) => void;
  onKeyDown: (event: any) => boolean;
  registerRef: (node: any) => void;
}) {
  const { colors, isDark } = useTheme();
  const activate = useCallback(
    () => onChange(option.value),
    [onChange, option],
  );
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(activate);
  const handleKeyDown = useCallback(
    (event: any) => {
      if (onKeyDown(event)) return;
      (webPressableProps as any).onKeyDown?.(event);
    },
    [onKeyDown, webPressableProps],
  );

  return (
    <Pressable
      {...webPressableProps}
      ref={registerRef}
      tabIndex={Platform.OS === "web" ? (selected ? 0 : -1) : undefined}
      {...(Platform.OS === "web" ? ({ onKeyDown: handleKeyDown } as any) : {})}
      onPress={activate}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.label}
      style={({ pressed, hovered }: any) => [
        styles.choice,
        selected && { backgroundColor: colors.tint + "18" },
        Platform.OS === "web" &&
          hovered &&
          !selected && {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.035)",
          },
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
        pressed && { opacity: 0.72 },
      ]}
    >
      <Text
        style={[
          styles.choiceLabel,
          { color: selected ? colors.text : colors.textSecondary },
          selected && styles.choiceLabelSelected,
        ]}
      >
        {option.label}
      </Text>
      {selected && <Ionicons name="checkmark" size={17} color={colors.tint} />}
    </Pressable>
  );
}

function SearchFilterControls({
  years,
  providers,
  year,
  provider,
  sort,
  onYearChange,
  onProviderChange,
  onSortChange,
  onReset,
}: SearchFilterControlsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isKeyboardFocused: isResetFocused, webPressableProps: resetProps } =
    useWebPressableActivation(onReset);
  const sortOptions: SearchFilterOption<SearchSort>[] = [
    { label: t("search.sort.default"), value: "default" },
    { label: t("search.sort.title"), value: "title" },
    { label: t("search.sort.year"), value: "year" },
  ];

  return (
    <>
      {years.length > 1 && (
        <ChoiceGroup
          label={t("search.filters.year")}
          options={years}
          value={year}
          onChange={onYearChange}
        />
      )}
      {providers.length > 1 && (
        <ChoiceGroup
          label={t("search.filters.provider")}
          options={providers}
          value={provider}
          onChange={onProviderChange}
        />
      )}
      <ChoiceGroup
        label={t("search.filters.sort")}
        options={sortOptions}
        value={sort}
        onChange={onSortChange}
      />
      <Pressable
        {...resetProps}
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel={t("search.filters.reset")}
        style={({ pressed }: any) => [
          styles.reset,
          { borderColor: colors.border },
          Platform.OS === "web" &&
            isResetFocused &&
            getWebFocusStyle(colors.focus),
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons
          name="refresh-outline"
          size={16}
          color={colors.textSecondary}
        />
        <Text style={[styles.resetLabel, { color: colors.textSecondary }]}>
          {t("search.filters.reset")}
        </Text>
      </Pressable>
    </>
  );
}

export function FilterSidebar(props: SearchFilterControlsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      testID="search-filter-panel"
      accessibilityLabel={t("search.filters.title")}
      style={[styles.sidebar, { backgroundColor: colors.card }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {t("search.filters.title")}
      </Text>
      <SearchFilterControls {...props} />
    </View>
  );
}

export function FilterSheet({
  visible,
  onClose,
  ...props
}: SearchFilterControlsProps & { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { isKeyboardFocused: isCloseFocused, webPressableProps: closeProps } =
    useWebPressableActivation(onClose);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable
          testID="search-filter-scrim"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          focusable={false}
          tabIndex={Platform.OS === "web" ? -1 : undefined}
        />
        <View
          testID="search-filter-panel"
          style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
          accessibilityViewIsModal
          accessibilityLabel={t("search.filters.title")}
        >
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>
                {t("search.filters.title")}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t("search.filters.subtitle")}
              </Text>
            </View>
            <Pressable
              {...closeProps}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("search.filters.close")}
              style={({ pressed }: any) => [
                styles.close,
                pressed && { opacity: 0.7 },
                Platform.OS === "web" &&
                  isCloseFocused &&
                  getWebFocusStyle(colors.focus),
              ]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <SearchFilterControls {...props} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    alignSelf: "flex-start",
    borderRadius: 12,
    padding: 18,
    gap: 20,
  },
  title: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  subtitle: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  group: { gap: 8 },
  groupLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  choices: { gap: 2 },
  choice: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  choiceLabel: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  choiceLabelSelected: { fontWeight: "700" },
  reset: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  resetLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  scrim: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
});
