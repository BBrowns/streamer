import React from "react";
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle, uiTouchTarget } from "../ui/designSystem";

type RecentSearchesProps = {
  items: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
  onRemove?: (query: string) => void;
  variant?: "page" | "compact";
  limit?: number;
  showEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RecentSearches({
  items,
  onSelect,
  onClear,
  onRemove,
  variant = "page",
  limit = variant === "compact" ? 6 : 4,
  showEmpty = variant === "compact",
  style,
}: RecentSearchesProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const visibleItems = items.slice(0, limit);

  if (visibleItems.length === 0 && !showEmpty) return null;

  return (
    <View
      testID={`recent-searches-${variant}`}
      style={[
        styles.container,
        variant === "compact" && styles.compactContainer,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {t("search.recent.title")}
        </Text>
        {visibleItems.length > 0 ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={t("search.recent.clear")}
            style={({ pressed, focused }: any) => [
              styles.clearButton,
              pressed && styles.pressed,
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Text style={[styles.clearLabel, { color: colors.tint }]}>
              {t("search.recent.clear")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {visibleItems.length > 0 ? (
        <View style={styles.list}>
          {visibleItems.map((query) => (
            <View
              key={query}
              style={[styles.row, { borderTopColor: colors.border }]}
            >
              <Pressable
                onPress={() => onSelect(query)}
                accessibilityRole="button"
                accessibilityLabel={t("search.recent.open", { query })}
                style={({ pressed, focused }: any) => [
                  styles.mainAction,
                  pressed && styles.pressed,
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.query, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {query}
                </Text>
              </Pressable>
              {onRemove ? (
                <Pressable
                  onPress={() => onRemove(query)}
                  accessibilityRole="button"
                  accessibilityLabel={t("search.recent.remove", { query })}
                  style={({ pressed, focused }: any) => [
                    styles.removeButton,
                    pressed && styles.pressed,
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(colors.focus),
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={17}
                    color={colors.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          {t("search.command.noRecent")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 760,
    gap: 4,
  },
  compactContainer: {
    minHeight: 180,
    maxWidth: "100%",
    padding: 18,
  },
  header: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  title: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  clearButton: {
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  clearLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    width: "100%",
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mainAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  query: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  removeButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  empty: {
    paddingVertical: 24,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.68,
  },
});
