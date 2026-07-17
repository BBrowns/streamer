import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
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
import { useSearchController } from "../../hooks/useSearchController";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  SEARCH_MINIMUM_LENGTH,
  getSearchSelectionDirection,
  normalizeSearchQueryInput,
  resolveCommandPaletteAction,
} from "../../services/searchController";
import { RecentSearches } from "../search/RecentSearches";
import { SearchSuggestions } from "../search/SearchSuggestions";
import { SearchField } from "./SearchField";

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
}

export function CommandPalette({ visible, onClose }: CommandPaletteProps) {
  const inputRef = useRef<TextInput>(null);
  const scale = useRef(new Animated.Value(0.98)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const searchController = useSearchController({ enabled: visible });
  const {
    query,
    setQuery,
    clearQuery,
    recentSearches,
    rememberSearch,
    clearRecentSearches,
    suggestions,
    suggestionSearch,
    state,
    selectedIndex,
    moveSelection,
    getSelectionSnapshot,
  } = searchController;

  useEffect(() => {
    if (!visible) return;
    clearQuery();
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
  }, [clearQuery, opacity, reducedMotion, scale, visible]);

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.98);
      opacity.setValue(0);
    }
  }, [opacity, scale, visible]);

  const openItem = useCallback(
    (item: SearchMetaPreview) => {
      void rememberSearch(query || item.name);
      onClose();
      router.push(`/detail/${item.type}/${item.id}`);
    },
    [onClose, query, rememberSearch, router],
  );

  const openAllResults = useCallback(
    (value: string) => {
      const clean = normalizeSearchQueryInput(value);
      if (clean.length < SEARCH_MINIMUM_LENGTH) return;
      void rememberSearch(clean);
      onClose();
      router.push({ pathname: "/search", params: { q: clean } });
    },
    [onClose, rememberSearch, router],
  );

  const submit = useCallback(() => {
    const selection = getSelectionSnapshot();
    const action = resolveCommandPaletteAction({
      deliberatelyNavigated: selection.deliberatelyNavigated,
      selectedIndex: selection.selectedIndex,
      suggestionCount: suggestions.length,
    });
    if (action.kind === "suggestion" && suggestions[action.index]) {
      openItem(suggestions[action.index]);
      return;
    }
    openAllResults(query);
  }, [getSelectionSnapshot, openAllResults, openItem, query, suggestions]);

  const handleKeyPress = useCallback(
    (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      const direction = getSearchSelectionDirection(key);
      if (direction) {
        event.preventDefault?.();
        moveSelection(direction);
      } else if (key === "Escape") {
        event.preventDefault?.();
        onClose();
      }
    },
    [moveSelection, onClose],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !visible || typeof document === "undefined") {
      return;
    }
    const handleWebKeyDown = (event: KeyboardEvent) => {
      const direction = getSearchSelectionDirection(event.key);
      if (direction) {
        event.preventDefault();
        moveSelection(direction);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleWebKeyDown, true);
    return () =>
      document.removeEventListener("keydown", handleWebKeyDown, true);
  }, [moveSelection, onClose, visible]);

  const isSearching = state === "loading-suggestions";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.72)"
              : "rgba(20,22,28,0.42)",
          },
        ]}
      >
        <Pressable
          testID="command-palette-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("search.command.close")}
        />
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
            onClear={clearQuery}
            clearAccessibilityLabel={t("search.actions.clearSearch")}
            loading={isSearching}
            placeholder={t("search.placeholder")}
            onKeyPress={Platform.OS === "web" ? undefined : handleKeyPress}
            onSubmitEditing={submit}
            accessibilityLabel={t("search.a11y.field")}
            inputStyle={styles.commandInput}
          />

          {!query ? (
            <RecentSearches
              variant="compact"
              items={recentSearches}
              onSelect={(value) => void openAllResults(value)}
              onClear={() => void clearRecentSearches()}
            />
          ) : query.trim().length < 2 ? (
            <View style={styles.hint}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {t("search.command.minimum")}
              </Text>
            </View>
          ) : (
            <SearchSuggestions
              testID="command-search-suggestions"
              variant="palette"
              query={query.trim()}
              items={suggestions}
              state={state}
              selectedIndex={selectedIndex}
              onSelect={(item) => void openItem(item)}
              onShowAll={() => void openAllResults(query)}
              onRetry={() => suggestionSearch.refetch()}
              onManageAddons={() => {
                onClose();
                router.push("/addons");
              }}
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
      </View>
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
  hint: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
