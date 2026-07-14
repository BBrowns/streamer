import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { MetaPreview } from "@streamer/shared";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import { useSearch, type SearchMetaPreview } from "../../hooks/useSearch";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { hapticImpactLight } from "../../lib/haptics";
import { SearchService } from "../../services/SearchService";
import {
  clearSearchFilters,
  countActiveSearchFilters,
  getSearchOutcome,
  parseSearchRouteState,
  searchRouteParams,
  type SearchSort,
  type SearchTypeFilter,
} from "../../services/searchState";
import { EmptyState } from "../ui/EmptyState";
import { ContentBoundary } from "../ui/ContentBoundary";
import { FilterChipBar } from "../ui/FilterChipBar";
import { getWebFocusStyle } from "../ui/designSystem";
import { PageLayout } from "../ui/PageLayout";
import { FilterSheet, FilterSidebar } from "./SearchFilters";
import { SearchDiscovery } from "./SearchDiscovery";
import { SearchResultCard } from "./SearchResultCard";

type YearFilter = "all" | string;

function extractYear(item: MetaPreview) {
  const source = item.releaseInfo ?? item.released ?? "";
  return source.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
}

function uniqueYears(items: MetaPreview[]) {
  return Array.from(
    new Set(items.map(extractYear).filter((year): year is string => !!year)),
  )
    .sort((left, right) => Number(right) - Number(left))
    .slice(0, 12);
}

export function SearchScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    type?: string;
    year?: string;
    provider?: string;
    sort?: string;
    mode?: string;
  }>();
  const routeState = parseSearchRouteState(params);
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width, isLarge } = useWindowClass();
  const [inputValue, setInputValue] = useState(routeState.q);
  const [submittedQuery, setSubmittedQuery] = useState(routeState.q);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(
    routeState.type,
  );
  const [yearFilter, setYearFilter] = useState<YearFilter>(routeState.year);
  const [providerFilter, setProviderFilter] = useState(routeState.provider);
  const [sort, setSort] = useState<SearchSort>(routeState.sort);
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fullSearch = useSearch(submittedQuery);
  const typeaheadQuery =
    inputValue.trim() === submittedQuery.trim() ? "" : inputValue;
  const suggestions = useGlobalSearch(typeaheadQuery);
  const results = fullSearch.data?.metas ?? [];
  const suggestionResults = suggestions.data?.metas ?? [];

  const loadRecent = useCallback(async () => {
    setRecentSearches(await SearchService.getRecentSearches());
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    setInputValue(routeState.q);
    setSubmittedQuery(routeState.q);
    setTypeFilter(routeState.type);
    setYearFilter(routeState.year);
    setProviderFilter(routeState.provider);
    setSort(routeState.sort);
  }, [
    routeState.q,
    routeState.provider,
    routeState.sort,
    routeState.type,
    routeState.year,
  ]);

  const syncRoute = useCallback(
    (overrides: Partial<Parameters<typeof searchRouteParams>[0]>) => {
      router.setParams(
        searchRouteParams({
          q: submittedQuery,
          type: typeFilter,
          year: yearFilter,
          provider: providerFilter,
          sort,
          mode: routeState.mode,
          ...overrides,
        }) as any,
      );
    },
    [
      providerFilter,
      routeState.mode,
      router,
      sort,
      submittedQuery,
      typeFilter,
      yearFilter,
    ],
  );

  const submitSearch = useCallback(
    async (query: string) => {
      const clean = query.trim();
      if (clean.length < 2) return;
      hapticImpactLight();
      const defaults = clearSearchFilters();
      setInputValue(clean);
      setSubmittedQuery(clean);
      setTypeFilter(defaults.type);
      setYearFilter(defaults.year);
      setProviderFilter(defaults.provider);
      setSort(defaults.sort);
      await SearchService.addRecentSearch(clean);
      await loadRecent();
      syncRoute({ q: clean, ...defaults });
    },
    [loadRecent, syncRoute],
  );

  const clearSearch = useCallback(() => {
    const defaults = clearSearchFilters();
    setInputValue("");
    setSubmittedQuery("");
    setTypeFilter(defaults.type);
    setYearFilter(defaults.year);
    setProviderFilter(defaults.provider);
    setSort(defaults.sort);
    syncRoute({ q: "", ...defaults });
  }, [syncRoute]);

  const resetFilters = useCallback(() => {
    const defaults = clearSearchFilters();
    setTypeFilter(defaults.type);
    setYearFilter(defaults.year);
    setProviderFilter(defaults.provider);
    setSort(defaults.sort);
    syncRoute(defaults);
  }, [syncRoute]);

  const removeRecent = useCallback(
    async (query: string) => {
      await SearchService.removeRecentSearch(query);
      await loadRecent();
    },
    [loadRecent],
  );

  const clearRecent = useCallback(async () => {
    await SearchService.clearRecentSearches();
    await loadRecent();
  }, [loadRecent]);

  const years = useMemo(() => uniqueYears(results), [results]);
  const providers = useMemo(
    () =>
      [...(fullSearch.data?.providers ?? [])]
        .map((provider) => ({ value: provider.id, label: provider.name }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [fullSearch.data?.providers],
  );
  const filteredResults = useMemo(() => {
    const filtered = results.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (yearFilter !== "all" && extractYear(item) !== yearFilter)
        return false;
      if (
        providerFilter !== "all" &&
        !item.providerIds.includes(providerFilter)
      ) {
        return false;
      }
      return true;
    });
    if (sort === "title") {
      return [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }
    if (sort === "year") {
      return [...filtered].sort(
        (left, right) =>
          Number(extractYear(right) ?? 0) - Number(extractYear(left) ?? 0),
      );
    }
    return filtered;
  }, [providerFilter, results, sort, typeFilter, yearFilter]);

  const activeFilterCount = countActiveSearchFilters({
    type: typeFilter,
    year: yearFilter,
    provider: providerFilter,
    sort,
  });
  const outcome = submittedQuery
    ? getSearchOutcome({
        isLoading: fullSearch.isLoading,
        isError: fullSearch.isError,
        attemptedProviders: fullSearch.data?.attemptedProviders ?? 0,
        successfulProviders: fullSearch.data?.successfulProviders ?? 0,
        failedProviderCount: fullSearch.data?.failedProviderIds.length ?? 0,
        resultCount: results.length,
        filteredResultCount: filteredResults.length,
        activeFilterCount,
      })
    : undefined;

  const typeOptions = [
    { label: t("search.types.all"), value: "all" as const },
    { label: t("search.types.moviePlural"), value: "movie" as const },
    { label: t("search.types.seriesPlural"), value: "series" as const },
  ];
  const yearOptions = [
    { label: t("search.filters.anyYear"), value: "all" },
    ...years.map((year) => ({ label: year, value: year })),
  ];
  const providerOptions = [
    { label: t("search.filters.allProviders"), value: "all" },
    ...providers,
  ];
  const filterProps = {
    years: yearOptions,
    providers: providerOptions,
    year: yearFilter,
    provider: providerFilter,
    sort,
    onYearChange: (value: string) => {
      setYearFilter(value);
      syncRoute({ year: value });
    },
    onProviderChange: (value: string) => {
      setProviderFilter(value);
      syncRoute({ provider: value });
    },
    onSortChange: (value: SearchSort) => {
      setSort(value);
      syncRoute({ sort: value });
    },
    onReset: resetFilters,
  };

  const showSuggestions =
    inputValue.trim().length >= 2 &&
    inputValue.trim() !== submittedQuery.trim() &&
    (suggestions.isDebouncing ||
      suggestions.isFetching ||
      suggestions.data !== undefined);
  const columns = Math.max(
    2,
    Math.min(6, Math.floor((width - (isLarge ? 528 : 48)) / 150)),
  );
  const sortLabel = t(`search.sort.${sort}`);

  const openSuggestion = useCallback(
    async (item: SearchMetaPreview) => {
      await SearchService.addRecentSearch(inputValue.trim() || item.name);
      await loadRecent();
      router.push(`/detail/${item.type}/${item.id}`);
    },
    [inputValue, loadRecent, router],
  );

  return (
    <PageLayout testID="search-screen" contained={false}>
      <View
        style={[styles.stickyHeader, { backgroundColor: colors.background }]}
      >
        <ContentBoundary padded={false} style={styles.stickyHeaderContent}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.tint }]}>
                {t("search.eyebrow")}
              </Text>
              <Text style={[styles.pageTitle, { color: colors.text }]}>
                {t("search.title")}
              </Text>
            </View>
            {Platform.OS === "web" && (
              <View style={[styles.shortcut, { backgroundColor: colors.card }]}>
                <Text
                  style={[styles.shortcutText, { color: colors.textSecondary }]}
                >
                  ⌘K
                </Text>
              </View>
            )}
          </View>

          <View
            style={[
              styles.searchField,
              {
                backgroundColor: colors.card,
                borderColor: searchFocused ? colors.focus : "transparent",
              },
              Platform.OS === "web" &&
                searchFocused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              testID="search-field"
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={() => submitSearch(inputValue)}
              placeholder={t("search.placeholder")}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("search.a11y.field")}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[styles.input, { color: colors.text }]}
            />
            {(suggestions.isDebouncing || suggestions.isFetching) &&
              inputValue.trim().length >= 2 && (
                <ActivityIndicator size="small" color={colors.tint} />
              )}
            {inputValue.length > 0 && (
              <Pressable
                onPress={clearSearch}
                accessibilityRole="button"
                accessibilityLabel={t("search.actions.clearSearch")}
                style={({ pressed, focused }: any) => [
                  styles.iconButton,
                  pressed && styles.pressed,
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {showSuggestions && (
            <View
              testID="search-suggestions"
              style={[
                styles.suggestions,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              {suggestionResults.map((item) => (
                <SearchResultCard
                  key={`${item.type}:${item.id}`}
                  item={item}
                  compact
                  onPress={() => openSuggestion(item)}
                />
              ))}
              {!suggestions.isFetching && suggestionResults.length === 0 && (
                <Text
                  style={[
                    styles.suggestionEmpty,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("search.suggestions.noMatch")}
                </Text>
              )}
              <Pressable
                onPress={() => submitSearch(inputValue)}
                accessibilityRole="button"
                accessibilityLabel={t("search.suggestions.showAll", {
                  query: inputValue.trim(),
                })}
                style={({ pressed, focused }: any) => [
                  styles.showAll,
                  { borderTopColor: colors.border },
                  pressed && styles.pressed,
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
              >
                <Text style={[styles.showAllText, { color: colors.tint }]}>
                  {t("search.suggestions.showAll", {
                    query: inputValue.trim(),
                  })}
                </Text>
                <Ionicons name="arrow-forward" size={17} color={colors.tint} />
              </Pressable>
            </View>
          )}
        </ContentBoundary>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ContentBoundary padded={false}>
          {!submittedQuery ? (
            <View style={styles.landing}>
              {recentSearches.length > 0 && (
                <View style={styles.recentSection}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      {t("search.recent.title")}
                    </Text>
                    <Pressable
                      onPress={clearRecent}
                      accessibilityRole="button"
                      accessibilityLabel={t("search.recent.clear")}
                      style={({ pressed, focused }: any) => [
                        styles.textButton,
                        pressed && styles.pressed,
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(colors.focus),
                      ]}
                    >
                      <Text
                        style={[styles.textButtonLabel, { color: colors.tint }]}
                      >
                        {t("search.recent.clear")}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.recentList}>
                    {recentSearches.map((query) => (
                      <View
                        key={query}
                        style={[
                          styles.recentRow,
                          { backgroundColor: colors.card },
                        ]}
                      >
                        <Pressable
                          onPress={() => submitSearch(query)}
                          accessibilityRole="button"
                          accessibilityLabel={t("search.recent.open", {
                            query,
                          })}
                          style={({ pressed, focused }: any) => [
                            styles.recentMain,
                            pressed && styles.pressed,
                            Platform.OS === "web" &&
                              focused &&
                              getWebFocusStyle(colors.focus),
                          ]}
                        >
                          <Ionicons
                            name="time-outline"
                            size={17}
                            color={colors.textSecondary}
                          />
                          <Text
                            style={[styles.recentText, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {query}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => removeRecent(query)}
                          accessibilityRole="button"
                          accessibilityLabel={t("search.recent.remove", {
                            query,
                          })}
                          style={({ pressed, focused }: any) => [
                            styles.iconButton,
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
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.discoveryHeading}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {t("search.discovery.title")}
                  </Text>
                  <Text
                    style={[
                      styles.sectionSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t("search.discovery.subtitle")}
                  </Text>
                </View>
                <FilterChipBar
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  containerStyle={styles.discoveryTypeFilter}
                  accessibilityLabel={t("search.filters.type")}
                />
              </View>
              <SearchDiscovery type={typeFilter} />
            </View>
          ) : (
            <View style={styles.resultsPage}>
              <View style={styles.toolbar}>
                <FilterChipBar
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  containerStyle={styles.typeFilter}
                  accessibilityLabel={t("search.filters.type")}
                />
                {!isLarge && (
                  <View style={styles.toolbarActions}>
                    <Pressable
                      testID="search-filter-toggle"
                      onPress={() => setFiltersOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t("search.filters.open")}
                      style={({ pressed, focused }: any) => [
                        styles.toolbarButton,
                        { backgroundColor: colors.card },
                        pressed && styles.pressed,
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(colors.focus),
                      ]}
                    >
                      <Ionicons
                        name="options-outline"
                        size={17}
                        color={colors.text}
                      />
                      <Text
                        style={[
                          styles.toolbarButtonText,
                          { color: colors.text },
                        ]}
                      >
                        {t("search.filters.button")}
                        {activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFiltersOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t("search.filters.sortBy", {
                        sort: sortLabel,
                      })}
                      style={({ pressed, focused }: any) => [
                        styles.toolbarButton,
                        { backgroundColor: colors.card },
                        pressed && styles.pressed,
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(colors.focus),
                      ]}
                    >
                      <Ionicons
                        name="swap-vertical-outline"
                        size={17}
                        color={colors.text}
                      />
                      <Text
                        style={[
                          styles.toolbarButtonText,
                          { color: colors.text },
                        ]}
                      >
                        {sortLabel}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={styles.resultsHeading}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.resultsTitle, { color: colors.text }]}
                >
                  {fullSearch.isLoading || fullSearch.isFetching
                    ? t("search.results.searching", { query: submittedQuery })
                    : t("search.results.summary", {
                        count: filteredResults.length,
                        query: submittedQuery,
                      })}
                </Text>
                {!fullSearch.isLoading && !fullSearch.isFetching && (
                  <Text
                    style={[
                      styles.resultsSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t("search.results.detailHint")}
                  </Text>
                )}
              </View>

              {fullSearch.data?.partial && (
                <View
                  style={[
                    styles.partialBanner,
                    { backgroundColor: colors.warning + "16" },
                  ]}
                >
                  <Ionicons
                    name="warning-outline"
                    size={19}
                    color={colors.warning}
                  />
                  <Text style={[styles.partialText, { color: colors.text }]}>
                    {t("search.states.partial", {
                      count: fullSearch.data.failedProviderIds.length,
                    })}
                  </Text>
                </View>
              )}

              <View style={styles.resultsLayout}>
                {isLarge && outcome !== "loading" && (
                  <FilterSidebar {...filterProps} />
                )}
                <View style={styles.resultsMain}>
                  {outcome === "loading" && (
                    <View style={styles.loadingState}>
                      <ActivityIndicator size="large" color={colors.tint} />
                      <Text
                        style={[
                          styles.loadingLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {t("search.results.searching", {
                          query: submittedQuery,
                        })}
                      </Text>
                    </View>
                  )}
                  {outcome === "transport-error" && (
                    <EmptyState
                      icon="cloud-offline-outline"
                      title={t("search.states.errorTitle")}
                      description={t("search.states.errorDescription")}
                      actionLabel={t("common.retry")}
                      onAction={() => fullSearch.refetch()}
                    />
                  )}
                  {outcome === "provider-error" && (
                    <EmptyState
                      icon="warning-outline"
                      title={t("search.states.providersFailedTitle")}
                      description={t(
                        "search.states.providersFailedDescription",
                      )}
                      actionLabel={t("common.retry")}
                      onAction={() => fullSearch.refetch()}
                    />
                  )}
                  {outcome === "no-providers" && (
                    <EmptyState
                      icon="extension-puzzle-outline"
                      title={t("search.discovery.noProvidersTitle")}
                      description={t("search.discovery.noProvidersDescription")}
                      actionLabel={t("search.discovery.manageAddons")}
                      onAction={() => router.push("/addons")}
                    />
                  )}
                  {outcome === "no-match" && (
                    <EmptyState
                      icon="search-outline"
                      title={t("search.states.noMatchTitle")}
                      description={t("search.states.noMatchDescription", {
                        query: submittedQuery,
                      })}
                      actionLabel={t("search.actions.clearSearch")}
                      onAction={clearSearch}
                    />
                  )}
                  {outcome === "filter-empty" && (
                    <EmptyState
                      icon="options-outline"
                      title={t("search.states.filterEmptyTitle")}
                      description={t("search.states.filterEmptyDescription")}
                      actionLabel={t("search.filters.reset")}
                      onAction={resetFilters}
                    />
                  )}
                  {outcome === "results" && (
                    <View testID="search-results-grid" style={styles.grid}>
                      {filteredResults.map((item) => (
                        <View
                          key={`${item.type}:${item.id}`}
                          style={[
                            styles.gridItem,
                            { width: `${100 / columns}%` },
                          ]}
                        >
                          <SearchResultCard item={item} />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </ContentBoundary>
      </ScrollView>

      <FilterSheet
        visible={filtersOpen && !isLarge}
        onClose={() => setFiltersOpen(false)}
        {...filterProps}
      />
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    zIndex: 20,
  },
  stickyHeaderContent: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 14,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headingCopy: { gap: 2 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  shortcut: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  shortcutText: { fontSize: 11, fontWeight: "800" },
  searchField: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 143,
    maxHeight: 500,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
    overflow: "hidden",
    zIndex: 30,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 44px rgba(0,0,0,0.32)" }
      : { elevation: 14 }),
  } as any,
  suggestionEmpty: {
    paddingVertical: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  showAll: {
    minHeight: 48,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  showAllText: { flex: 1, fontSize: 13, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 64 },
  landing: { gap: 32 },
  recentSection: { paddingHorizontal: 24, gap: 12 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: { fontSize: 13, fontWeight: "700" },
  recentList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recentRow: {
    minWidth: 220,
    maxWidth: 360,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
  },
  recentMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 14,
  },
  recentText: { flex: 1, fontSize: 14, fontWeight: "600" },
  discoveryHeading: {
    paddingHorizontal: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  discoveryTypeFilter: { marginVertical: 0 },
  resultsPage: { paddingHorizontal: 24 },
  toolbar: {
    minHeight: 52,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  typeFilter: { marginVertical: 0, marginHorizontal: -16 },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolbarButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  toolbarButtonText: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  resultsHeading: { marginTop: 10, marginBottom: 16, gap: 3 },
  resultsTitle: { fontSize: 22, lineHeight: 27, fontWeight: "800" },
  resultsSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  partialBanner: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partialText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  resultsLayout: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  resultsMain: { flex: 1, minWidth: 0 },
  loadingState: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingLabel: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -7 },
  gridItem: { paddingHorizontal: 7, marginBottom: 26 },
  pressed: { opacity: 0.72 },
});
