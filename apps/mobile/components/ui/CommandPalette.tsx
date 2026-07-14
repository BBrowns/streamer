import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { SearchMetaPreview } from "../../hooks/useSearch";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { SearchService } from "../../services/SearchService";
import { moveSearchSelection } from "../../services/searchController";
import { SearchResultCard } from "../search/SearchResultCard";
import { AppButton } from "./AppButton";
import { getWebFocusStyle } from "./designSystem";

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
}

export function CommandPalette({ visible, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<TextInput>(null);
  const scale = useRef(new Animated.Value(0.98)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const search = useGlobalSearch(query);
  const results = search.data?.metas ?? [];

  const loadRecent = useCallback(async () => {
    setRecentSearches(await SearchService.getRecentSearches());
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSelectedIndex(-1);
    loadRecent();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
    if (reducedMotion) {
      scale.setValue(1);
      opacity.setValue(1);
    } else {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 160,
          friction: 14,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
    return () => clearTimeout(focusTimer);
  }, [loadRecent, opacity, reducedMotion, scale, visible]);

  useEffect(() => {
    setSelectedIndex(results.length > 0 ? 0 : -1);
  }, [results.length, search.debouncedQuery]);

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.98);
      opacity.setValue(0);
    }
  }, [opacity, scale, visible]);

  const saveSearch = useCallback(
    async (value: string) => {
      const clean = value.trim();
      if (!clean) return;
      await SearchService.addRecentSearch(clean);
      await loadRecent();
    },
    [loadRecent],
  );

  const openItem = useCallback(
    async (item: SearchMetaPreview) => {
      await saveSearch(query || item.name);
      onClose();
      router.push(`/detail/${item.type}/${item.id}`);
    },
    [onClose, query, router, saveSearch],
  );

  const submit = useCallback(async () => {
    if (selectedIndex >= 0 && results[selectedIndex]) {
      await openItem(results[selectedIndex]);
      return;
    }
    const clean = query.trim();
    if (clean.length < 2) return;
    await saveSearch(clean);
    onClose();
    router.push({ pathname: "/search", params: { q: clean } });
  }, [onClose, openItem, query, results, router, saveSearch, selectedIndex]);

  const handleKeyPress = useCallback(
    (event: any) => {
      const key = event.nativeEvent?.key;
      if (key === "ArrowDown") {
        event.preventDefault?.();
        setSelectedIndex((current) =>
          moveSearchSelection(current, results.length, "next"),
        );
      } else if (key === "ArrowUp") {
        event.preventDefault?.();
        setSelectedIndex((current) =>
          moveSearchSelection(current, results.length, "previous"),
        );
      } else if (key === "Escape") {
        event.preventDefault?.();
        onClose();
      }
    },
    [onClose, results.length],
  );

  const clearHistory = useCallback(async () => {
    await SearchService.clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const isSearching = search.isDebouncing || search.isFetching;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[
          styles.backdrop,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.72)"
              : "rgba(20,22,28,0.42)",
          },
        ]}
        onPress={onClose}
      >
        <Animated.View
          testID="command-palette"
          accessibilityViewIsModal
          accessibilityLabel={t("search.command.label")}
          style={[
            styles.palette,
            {
              transform: [{ scale }],
              opacity,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <Pressable
            onPress={() => inputRef.current?.focus()}
            style={styles.inputRow}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              ref={inputRef}
              testID="command-search-field"
              style={[styles.input, { color: colors.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t("search.placeholder")}
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onKeyPress={handleKeyPress}
              onSubmitEditing={submit}
              accessibilityLabel={t("search.a11y.field")}
            />
            {isSearching && (
              <ActivityIndicator size="small" color={colors.tint} />
            )}
            {query.length > 0 && !isSearching && (
              <Pressable
                onPress={() => setQuery("")}
                accessibilityRole="button"
                accessibilityLabel={t("search.actions.clearSearch")}
                style={({ pressed, focused }: any) => [
                  styles.clearButton,
                  pressed && styles.pressed,
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {!query ? (
            <View style={styles.history}>
              <View style={styles.historyHeader}>
                <Text
                  style={[styles.historyTitle, { color: colors.textSecondary }]}
                >
                  {t("search.recent.title")}
                </Text>
                {recentSearches.length > 0 && (
                  <Pressable
                    onPress={clearHistory}
                    accessibilityRole="button"
                    accessibilityLabel={t("search.recent.clear")}
                    style={({ pressed, focused }: any) => [
                      styles.historyClearButton,
                      pressed && styles.pressed,
                      Platform.OS === "web" &&
                        focused &&
                        getWebFocusStyle(colors.focus),
                    ]}
                  >
                    <Text style={[styles.historyClear, { color: colors.tint }]}>
                      {t("search.recent.clear")}
                    </Text>
                  </Pressable>
                )}
              </View>
              {recentSearches.length > 0 ? (
                recentSearches.slice(0, 6).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setQuery(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t("search.recent.open", {
                      query: item,
                    })}
                    style={({ pressed, focused }: any) => [
                      styles.historyItem,
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
                      style={[styles.historyItemText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text
                  style={[styles.hintText, { color: colors.textSecondary }]}
                >
                  {t("search.command.noRecent")}
                </Text>
              )}
            </View>
          ) : query.trim().length < 2 ? (
            <View style={styles.hint}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {t("search.command.minimum")}
              </Text>
            </View>
          ) : search.isError ? (
            <View style={styles.hint}>
              <Text style={[styles.errorTitle, { color: colors.text }]}>
                {t("search.command.errorTitle", {
                  defaultValue: "Search is unavailable",
                })}
              </Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {t("search.command.errorDescription", {
                  defaultValue: "Check your connection and try again.",
                })}
              </Text>
              <AppButton
                label={t("common.retry")}
                variant="secondary"
                icon="refresh-outline"
                onPress={() => search.refetch()}
              />
            </View>
          ) : !isSearching && results.length === 0 ? (
            <View style={styles.hint}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {t("search.command.noResults", { query })}
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => `${item.type}:${item.id}`}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item, index }) => (
                <View
                  style={[
                    styles.result,
                    selectedIndex === index && {
                      backgroundColor: colors.tint + "14",
                    },
                  ]}
                >
                  <SearchResultCard
                    item={item}
                    compact
                    onPress={() => openItem(item)}
                  />
                </View>
              )}
            />
          )}

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              ↑↓ {t("search.command.navigate")}
            </Text>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              ↵ {t("search.command.open")} · Esc {t("search.command.close")}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  palette: {
    width: "100%",
    maxWidth: 620,
    maxHeight: 570,
    borderRadius: 20,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 26px 70px rgba(0,0,0,0.46)" }
      : { elevation: 24 }),
  } as any,
  inputRow: {
    minHeight: 62,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  divider: { height: 1 },
  list: { maxHeight: 390, paddingHorizontal: 10 },
  result: { borderRadius: 10, paddingHorizontal: 8 },
  history: { padding: 18, minHeight: 180 },
  historyHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  historyClearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  historyClear: { fontSize: 12, fontWeight: "700" },
  historyItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  historyItemText: { flex: 1, fontSize: 14, fontWeight: "600" },
  hint: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  hintText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    minHeight: 44,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerText: { fontSize: 11, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
