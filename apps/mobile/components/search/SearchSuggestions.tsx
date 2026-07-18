import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { SearchMetaPreview } from "../../hooks/useSearch";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import type { SearchInteractionState } from "../../services/searchController";
import { getWebFocusStyle } from "../ui/designSystem";
import { SearchResultCard } from "./SearchResultCard";

interface SearchSuggestionsProps {
  query: string;
  items: SearchMetaPreview[];
  state: SearchInteractionState;
  selectedIndex?: number;
  onSelect: (item: SearchMetaPreview) => void;
  onShowAll: () => void;
  onRetry: () => void;
  onManageAddons: () => void;
  testID?: string;
  variant?: "page" | "palette";
}

/** Shared suggestion presentation used by full Search and quick search. */
export function SearchSuggestions({
  query,
  items,
  state,
  selectedIndex = -1,
  onSelect,
  onShowAll,
  onRetry,
  onManageAddons,
  testID,
  variant = "page",
}: SearchSuggestionsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const {
    isKeyboardFocused: isShowAllFocused,
    webPressableProps: showAllProps,
  } = useWebPressableActivation(onShowAll);

  useEffect(() => {
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, selectedIndex * 72 - 210),
      animated: false,
    });
  }, [selectedIndex]);

  const showItems = items.length > 0;
  const selectedAnnouncement =
    selectedIndex >= 0
      ? selectedIndex < items.length
        ? items[selectedIndex]?.name
        : t("search.suggestions.showAll", { query })
      : undefined;

  return (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      style={[styles.scroll, variant === "palette" && styles.paletteScroll]}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={t("search.suggestions.label")}
    >
      {selectedAnnouncement ? (
        <Text
          key={`${query}:${selectedIndex}`}
          testID="search-suggestion-announcement"
          accessible
          accessibilityLiveRegion="polite"
          style={styles.liveAnnouncement}
        >
          {selectedAnnouncement}
        </Text>
      ) : null}
      {state === "loading-suggestions" && !showItems ? (
        <View
          style={styles.message}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
        >
          <ActivityIndicator size="small" color={colors.tint} />
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>
            {t("search.suggestions.loading")}
          </Text>
        </View>
      ) : state === "transport-error" ? (
        <SuggestionMessage
          icon="cloud-offline-outline"
          message={t("search.command.errorDescription")}
          action={t("common.retry")}
          onAction={onRetry}
        />
      ) : state === "no-search-provider" ? (
        <SuggestionMessage
          icon="extension-puzzle-outline"
          message={t("search.states.noSearchProviderDescription")}
          action={t("search.discovery.manageAddons")}
          onAction={onManageAddons}
        />
      ) : state === "provider-unavailable" ? (
        <SuggestionMessage
          icon="warning-outline"
          message={t("search.states.providersFailedDescription")}
          action={t("common.retry")}
          onAction={onRetry}
        />
      ) : state === "partial-results" && items.length === 0 ? (
        <SuggestionMessage
          icon="warning-outline"
          message={t("search.states.partialCompact")}
          action={t("common.retry")}
          onAction={onRetry}
        />
      ) : state === "truncated-results" && items.length === 0 ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.textSecondary}
          />
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>
            {t("search.states.truncatedCompact")}
          </Text>
        </View>
      ) : state === "no-results" ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>
            {t("search.suggestions.noMatch")}
          </Text>
        </View>
      ) : null}

      {showItems
        ? items.map((item, index) => {
            const selected = index === selectedIndex;
            return (
              <View
                key={`${item.type}:${item.id}`}
                testID={`search-suggestion-${item.type}-${item.id}`}
                accessibilityState={{ selected }}
                accessibilityLiveRegion={selected ? "polite" : "none"}
                style={[
                  styles.result,
                  selected && { backgroundColor: colors.tint + "14" },
                ]}
              >
                <SearchResultCard
                  item={item}
                  compact
                  onPress={() => onSelect(item)}
                />
              </View>
            );
          })
        : null}

      {state === "partial-results" && items.length > 0 ? (
        <View style={styles.inlineNotice} accessibilityLiveRegion="polite">
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text
            style={[styles.inlineNoticeText, { color: colors.textSecondary }]}
          >
            {t("search.states.partialCompact")}
          </Text>
        </View>
      ) : null}

      {state === "truncated-results" && items.length > 0 ? (
        <View style={styles.inlineNotice} accessibilityLiveRegion="polite">
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.textSecondary}
          />
          <Text
            style={[styles.inlineNoticeText, { color: colors.textSecondary }]}
          >
            {t("search.states.truncatedCompact")}
          </Text>
        </View>
      ) : null}

      <Pressable
        {...showAllProps}
        testID="search-suggestion-all-results"
        onPress={onShowAll}
        accessibilityRole="button"
        accessibilityState={{ selected: selectedIndex === items.length }}
        accessibilityLabel={t("search.suggestions.showAll", { query })}
        style={({ pressed }: any) => [
          styles.showAll,
          { borderTopColor: colors.border },
          selectedIndex === items.length && {
            backgroundColor: colors.tint + "14",
          },
          pressed && styles.pressed,
          Platform.OS === "web" &&
            isShowAllFocused &&
            getWebFocusStyle(colors.focus),
        ]}
      >
        <View style={styles.showAllCopy}>
          <Ionicons name="search" size={17} color={colors.tint} />
          <Text style={[styles.showAllText, { color: colors.tint }]}>
            {t("search.suggestions.showAll", { query })}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={17} color={colors.tint} />
      </Pressable>
    </ScrollView>
  );
}

function SuggestionMessage({
  icon,
  message,
  action,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  action: string;
  onAction: () => void;
}) {
  const { colors } = useTheme();
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(onAction);
  return (
    <View style={styles.message} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={[styles.messageText, { color: colors.textSecondary }]}>
        {message}
      </Text>
      <Pressable
        {...webPressableProps}
        onPress={onAction}
        accessibilityRole="button"
        style={({ pressed }: any) => [
          styles.messageAction,
          pressed && styles.pressed,
          Platform.OS === "web" &&
            isKeyboardFocused &&
            getWebFocusStyle(colors.focus),
        ]}
      >
        <Text style={[styles.messageActionText, { color: colors.tint }]}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 500 },
  paletteScroll: { maxHeight: 400 },
  liveAnnouncement: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  result: { borderRadius: 10, paddingHorizontal: 10 },
  message: {
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  messageText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  messageAction: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  messageActionText: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  inlineNotice: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  showAll: {
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  showAllCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  showAllText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  pressed: { opacity: 0.7 },
});
