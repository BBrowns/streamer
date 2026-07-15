import React, { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { SearchMetaPreview } from "../../hooks/useSearch";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { SearchService } from "../../services/SearchService";
import { moveSearchSelection } from "../../services/searchController";
import { RecentSearches } from "../search/RecentSearches";
import { SearchResultCard } from "../search/SearchResultCard";
import { AppButton } from "./AppButton";
import { SearchField } from "./SearchField";

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
          <SearchField
            ref={inputRef}
            inset
            testID="command-search-field"
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            clearAccessibilityLabel={t("search.actions.clearSearch")}
            loading={isSearching}
            placeholder={t("search.placeholder")}
            onKeyPress={handleKeyPress}
            onSubmitEditing={submit}
            accessibilityLabel={t("search.a11y.field")}
            inputStyle={styles.commandInput}
          />

          {!query ? (
            <RecentSearches
              variant="compact"
              items={recentSearches}
              onSelect={setQuery}
              onClear={() => void clearHistory()}
            />
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
  commandInput: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  list: { maxHeight: 390, paddingHorizontal: 10 },
  result: { borderRadius: 10, paddingHorizontal: 8 },
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
