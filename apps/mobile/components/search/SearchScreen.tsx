import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { ContentTabs } from "../ui/ContentTabs";
import { getWebFocusStyle } from "../ui/designSystem";
import { PageLayout } from "../ui/PageLayout";
import { SearchField } from "../ui/SearchField";
import { FilterSheet, FilterSidebar } from "./SearchFilters";
import { RecentSearches } from "./RecentSearches";
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
  const { width, isCompact, isLarge } = useWindowClass();
  const [inputValue, setInputValue] = useState(routeState.q);
  const [submittedQuery, setSubmittedQuery] = useState(routeState.q);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(
    routeState.type,
  );
  const [yearFilter, setYearFilter] = useState<YearFilter>(routeState.year);
  const [providerFilter, setProviderFilter] = useState(routeState.provider);
  const [sort, setSort] = useState<SearchSort>(routeState.sort);
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
          </View>

          <View style={styles.searchArea}>
            <SearchField
              testID="search-field"
              value={inputValue}
              onChangeText={setInputValue}
              onClear={clearSearch}
              clearAccessibilityLabel={t("search.actions.clearSearch")}
              loading={
                inputValue.trim().length >= 2 &&
                (suggestions.isDebouncing || suggestions.isFetching)
              }
              shortcutHint={
                Platform.OS === "web" && !isCompact && !isLarge
                  ? "⌘K"
                  : undefined
              }
              onSubmitEditing={() => submitSearch(inputValue)}
              placeholder={t("search.placeholder")}
              accessibilityLabel={t("search.a11y.field")}
            />

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
                  <Ionicons
                    name="arrow-forward"
                    size={17}
                    color={colors.tint}
                  />
                </Pressable>
              </View>
            )}
          </View>
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
              <RecentSearches
                items={recentSearches}
                onSelect={(query) => void submitSearch(query)}
                onRemove={(query) => void removeRecent(query)}
                onClear={() => void clearRecent()}
                style={styles.recentSection}
              />

              <View style={styles.discoveryHeading}>
                <View style={styles.discoveryHeadingCopy}>
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
                <View style={styles.discoveryTypeControl}>
                  <Text
                    style={[
                      styles.discoveryTypeLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t("search.filters.contentType", {
                      defaultValue: "Content type",
                    })}
                  </Text>
                  <ContentTabs
                    options={typeOptions}
                    value={typeFilter}
                    onChange={(value) => {
                      setTypeFilter(value);
                      syncRoute({ type: value });
                    }}
                    style={styles.discoveryTypeFilter}
                    accessibilityLabel={t("search.filters.contentType", {
                      defaultValue: "Content type",
                    })}
                  />
                </View>
              </View>
              <SearchDiscovery type={typeFilter} />
            </View>
          ) : (
            <View style={styles.resultsPage}>
              <View style={styles.toolbar}>
                <ContentTabs
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  style={styles.typeFilter}
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
    marginBottom: 18,
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
  searchArea: { position: "relative", width: "100%", maxWidth: 760 },
  suggestions: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 56,
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
  landing: { gap: 36 },
  recentSection: { paddingHorizontal: 24 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  discoveryHeading: {
    paddingHorizontal: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  discoveryHeadingCopy: { flexGrow: 1, minWidth: 220 },
  discoveryTypeControl: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  discoveryTypeLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  discoveryTypeFilter: { marginTop: 0 },
  resultsPage: { paddingHorizontal: 24 },
  toolbar: {
    minHeight: 52,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  typeFilter: { marginVertical: 0 },
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
