import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  useInfiniteSearch,
  useSearch,
  type SearchMetaPreview,
} from "../../hooks/useSearch";
import { useSearchController } from "../../hooks/useSearchController";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { useWindowClass } from "../../hooks/useWindowClass";
import { hapticImpactLight } from "../../lib/haptics";
import {
  getSearchShortcutLabel,
  getSearchSelectionDirection,
  normalizeSearchQueryInput,
  shouldShowSearchSuggestions,
  type SearchInteractionState,
} from "../../services/searchController";
import {
  clearSearchFilters,
  countActiveSearchFilters,
  getSearchFilterPaginationState,
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
import { SearchDiscovery } from "./SearchDiscovery";
import { SearchResultCard } from "./SearchResultCard";
import { SearchSuggestions } from "./SearchSuggestions";

type YearFilter = "all" | string;
type SearchScreenResultState =
  | SearchInteractionState
  | "filter-pagination-limit";

function preserveCurrentWebSearchHistoryEntry() {
  if (Platform.OS !== "web") return false;
  const browser = globalThis as typeof globalThis & {
    history?: {
      state?: unknown;
      pushState?: (state: unknown, unused: string, url?: string) => void;
    };
    location?: { href?: string };
  };
  if (!browser.history?.pushState || !browser.location?.href) return false;
  browser.history.pushState(browser.history.state, "", browser.location.href);
  return true;
}

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
  }>();
  const routeState = parseSearchRouteState(params);
  const routeSubmittedQuery = routeState.q.length >= 2 ? routeState.q : "";
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width, isCompact, isLarge } = useWindowClass();
  const [submittedQuery, setSubmittedQuery] = useState(routeSubmittedQuery);
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(
    routeState.type,
  );
  const [yearFilter, setYearFilter] = useState<YearFilter>(routeState.year);
  const [providerFilter, setProviderFilter] = useState(routeState.provider);
  const [sort, setSort] = useState<SearchSort>(routeState.sort);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchFieldFocused, setSearchFieldFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const searchAreaRef = useRef<View>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchController = useSearchController({
    initialQuery: routeState.q,
    suppressedSuggestionQuery: submittedQuery,
  });
  const inputValue = searchController.query;

  const fullSearch = useInfiniteSearch(submittedQuery, {
    mode: "results",
    type: typeFilter,
    limit: 100,
    minimumLength: 2,
  });
  const results = fullSearch.data?.metas ?? [];
  const shouldProbeUnfilteredResults =
    !!submittedQuery &&
    typeFilter !== "all" &&
    !fullSearch.isLoading &&
    !fullSearch.isError &&
    results.length === 0 &&
    (fullSearch.data?.attemptedProviders ?? 0) > 0 &&
    (fullSearch.data?.successfulProviders ?? 0) > 0;
  const unfilteredResultProbe = useSearch(submittedQuery, {
    mode: "results",
    type: "all",
    limit: 1,
    minimumLength: 2,
    enabled: shouldProbeUnfilteredResults,
  });
  const isClassifyingTypeEmpty =
    shouldProbeUnfilteredResults &&
    (unfilteredResultProbe.isLoading || unfilteredResultProbe.isFetching);

  useEffect(() => {
    searchController.setQuery(routeState.q);
    setSubmittedQuery(routeSubmittedQuery);
  }, [routeState.q, routeSubmittedQuery, searchController.setQuery]);

  useEffect(() => {
    setTypeFilter(routeState.type);
    setYearFilter(routeState.year);
    setProviderFilter(routeState.provider);
    setSort(routeState.sort);
  }, [routeState.provider, routeState.sort, routeState.type, routeState.year]);

  const syncRoute = useCallback(
    (overrides: Partial<Parameters<typeof searchRouteParams>[0]>) => {
      preserveCurrentWebSearchHistoryEntry();
      router.setParams(
        searchRouteParams({
          q: submittedQuery,
          type: typeFilter,
          year: yearFilter,
          provider: providerFilter,
          sort,
          ...overrides,
        }) as any,
      );
    },
    [providerFilter, router, sort, submittedQuery, typeFilter, yearFilter],
  );

  const submitSearch = useCallback(
    (query: string) => {
      const clean = normalizeSearchQueryInput(query);
      if (clean.length < 2) return;
      hapticImpactLight();
      const defaults = clearSearchFilters();
      searchController.setQuery(clean);
      setSubmittedQuery(clean);
      setTypeFilter(defaults.type);
      setYearFilter(defaults.year);
      setProviderFilter(defaults.provider);
      setSort(defaults.sort);
      setSuggestionsDismissed(true);
      void searchController.rememberSearch(clean);
      const nextParams = searchRouteParams({
        q: clean,
        ...defaults,
      }) as any;
      if (preserveCurrentWebSearchHistoryEntry()) {
        router.setParams(nextParams);
      } else {
        router.push({ pathname: "/search", params: nextParams });
      }
    },
    [router, searchController],
  );

  const clearSearch = useCallback(() => {
    const defaults = clearSearchFilters();
    searchController.clearQuery();
    setSubmittedQuery("");
    setTypeFilter(defaults.type);
    setYearFilter(defaults.year);
    setProviderFilter(defaults.provider);
    setSort(defaults.sort);
    syncRoute({ q: "", ...defaults });
  }, [searchController, syncRoute]);

  const resetFilters = useCallback(() => {
    const defaults = clearSearchFilters();
    setTypeFilter(defaults.type);
    setYearFilter(defaults.year);
    setProviderFilter(defaults.provider);
    setSort(defaults.sort);
    syncRoute(defaults);
  }, [syncRoute]);

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
  const secondaryFilterCount = countActiveSearchFilters({
    type: "all",
    year: yearFilter,
    provider: providerFilter,
    sort,
  });
  const filterPaginationState = getSearchFilterPaginationState({
    activeSecondaryFilterCount: secondaryFilterCount,
    hasNextPage: !!fullSearch.hasNextPage,
    pageCount: fullSearch.pageCount,
    isNextPageError: fullSearch.isFetchNextPageError,
  });
  const isPreparingFilteredResults = filterPaginationState === "loading";
  const hasSearchData = fullSearch.data !== undefined;
  const isInitialSearchLoading =
    !hasSearchData &&
    (fullSearch.isLoading ||
      (fullSearch.isFetching && !fullSearch.isFetchingNextPage));
  const hasInlineNextPageError =
    hasSearchData &&
    results.length > 0 &&
    secondaryFilterCount === 0 &&
    fullSearch.isFetchNextPageError;
  const hasBlockingTransportError =
    fullSearch.isError &&
    (!hasSearchData ||
      (results.length === 0 && !fullSearch.isFetchNextPageError));

  useEffect(() => {
    if (isPreparingFilteredResults && !fullSearch.isFetchingNextPage) {
      void fullSearch.fetchNextPage();
    }
  }, [
    fullSearch.fetchNextPage,
    fullSearch.isFetchingNextPage,
    isPreparingFilteredResults,
  ]);

  useEffect(() => {
    if (isPreparingFilteredResults) setFiltersOpen(false);
  }, [isPreparingFilteredResults]);

  const outcome = submittedQuery
    ? getSearchOutcome({
        isLoading:
          isInitialSearchLoading ||
          isClassifyingTypeEmpty ||
          isPreparingFilteredResults,
        isError: hasBlockingTransportError || filterPaginationState === "error",
        attemptedProviders: fullSearch.data?.attemptedProviders ?? 0,
        successfulProviders: fullSearch.data?.successfulProviders ?? 0,
        failedProviderCount: fullSearch.data?.failedProviderIds.length ?? 0,
        resultCount: results.length,
        filteredResultCount: filteredResults.length,
        activeFilterCount,
        unfilteredResultCount: unfilteredResultProbe.data?.total,
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
    shouldShowSearchSuggestions(
      inputValue,
      submittedQuery,
      searchController.state,
    ) &&
    searchFieldFocused &&
    !suggestionsDismissed;
  const columns = Math.max(
    2,
    Math.min(6, Math.floor((width - (isLarge ? 528 : 48)) / 150)),
  );
  const sortLabel = t(`search.sort.${sort}`);
  const shortcutHint =
    Platform.OS === "web" && !isCompact
      ? getSearchShortcutLabel(
          typeof navigator === "undefined" ? undefined : navigator.platform,
        )
      : undefined;

  const openSuggestion = useCallback(
    (item: SearchMetaPreview) => {
      setSuggestionsDismissed(true);
      void searchController.rememberSearch(inputValue.trim() || item.name);
      router.push(`/detail/${item.type}/${item.id}`);
    },
    [inputValue, router, searchController],
  );

  const dismissSuggestions = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
    setSearchFieldFocused(false);
    setSuggestionsDismissed(true);
    searchController.resetSelection?.();
  }, [searchController.resetSelection]);

  const handleSearchFieldFocus = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
    setSearchFieldFocused(true);
    setSuggestionsDismissed(false);
  }, []);

  const handleSearchFieldBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    // Keep the list mounted through the ensuing click/tap. Browser focus moves
    // before Pressable dispatches its activation event.
    blurTimerRef.current = setTimeout(() => {
      setSearchFieldFocused(false);
      setSuggestionsDismissed(true);
      blurTimerRef.current = null;
    }, 160);
  }, []);

  const handleSearchQueryChange = useCallback(
    (value: string) => {
      setSuggestionsDismissed(false);
      searchController.setQuery(value);
    },
    [searchController.setQuery],
  );

  const handleSearchFieldKeyPress = useCallback(
    (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (key === "Escape") {
        event.preventDefault?.();
        setSuggestionsDismissed(true);
        searchController.resetSelection?.();
        return;
      }
      const direction = getSearchSelectionDirection(key);
      if (!direction) return;
      event.preventDefault?.();
      searchController.moveSelection(direction);
    },
    [searchController.moveSelection, searchController.resetSelection],
  );

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !searchFieldFocused ||
      typeof document === "undefined"
    ) {
      return;
    }
    const handleWebKeyDown = (event: KeyboardEvent) => {
      handleSearchFieldKeyPress(event);
    };
    document.addEventListener("keydown", handleWebKeyDown, true);
    return () =>
      document.removeEventListener("keydown", handleWebKeyDown, true);
  }, [handleSearchFieldKeyPress, searchFieldFocused]);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !showSuggestions ||
      typeof document === "undefined"
    ) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      const searchArea = searchAreaRef.current as unknown as {
        contains?: (target: EventTarget | null) => boolean;
      } | null;
      if (!searchArea?.contains?.(event.target)) dismissSuggestions();
    };
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [dismissSuggestions, showSuggestions]);

  useEffect(
    () => () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    },
    [],
  );

  const retryFullSearch = useCallback(() => {
    if (filterPaginationState === "error") {
      void fullSearch.fetchNextPage();
      return;
    }
    void fullSearch.refetch();
  }, [filterPaginationState, fullSearch.fetchNextPage, fullSearch.refetch]);

  let resultState: SearchScreenResultState | undefined;
  if (submittedQuery) {
    if (filterPaginationState === "limit") {
      resultState = "filter-pagination-limit";
    } else if (
      isInitialSearchLoading ||
      isClassifyingTypeEmpty ||
      isPreparingFilteredResults
    ) {
      resultState = "loading-results";
    } else if (hasBlockingTransportError || filterPaginationState === "error") {
      resultState = "transport-error";
    } else if (outcome === "no-providers") {
      resultState = "no-search-provider";
    } else if (outcome === "provider-error") {
      resultState = "provider-unavailable";
    } else if (outcome === "no-match" || outcome === "filter-empty") {
      resultState = "no-results";
    } else if (
      fullSearch.data?.partial &&
      fullSearch.data.failedProviderIds.length > 0
    ) {
      resultState = "partial-results";
    } else if (fullSearch.data?.truncated) {
      resultState = "truncated-results";
    } else {
      resultState = "results";
    }
  }

  return (
    <PageLayout testID="search-screen" contained={false}>
      <View
        style={[styles.stickyHeader, { backgroundColor: colors.background }]}
      >
        <ContentBoundary padded={false} style={styles.stickyHeaderContent}>
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.tint }]}>
                {t("search.eyebrow")}
              </Text>
              <Text style={[styles.pageTitle, { color: colors.text }]}>
                {t("search.title")}
              </Text>
            </View>

            <View
              ref={searchAreaRef}
              style={[styles.searchArea, isCompact && styles.searchAreaCompact]}
            >
              <SearchField
                testID="search-field"
                variant="surface"
                value={inputValue}
                onChangeText={handleSearchQueryChange}
                onClear={clearSearch}
                clearAccessibilityLabel={t("search.actions.clearSearch")}
                loading={
                  inputValue.trim().length >= 2 &&
                  searchController.state === "loading-suggestions"
                }
                shortcutHint={shortcutHint}
                onKeyPress={
                  Platform.OS === "web" ? undefined : handleSearchFieldKeyPress
                }
                onFocus={handleSearchFieldFocus}
                onBlur={handleSearchFieldBlur}
                onSubmitEditing={() => submitSearch(inputValue)}
                placeholder={t("search.placeholder")}
                accessibilityLabel={t("search.a11y.field")}
                containerStyle={styles.pageSearchField}
              />

              {showSuggestions && (
                <View
                  testID="search-suggestions"
                  style={[
                    styles.suggestions,
                    { backgroundColor: colors.surfaceElevated },
                  ]}
                >
                  <SearchSuggestions
                    query={inputValue.trim()}
                    items={searchController.suggestions}
                    state={searchController.state}
                    selectedIndex={searchController.selectedIndex}
                    onSelect={(item) => void openSuggestion(item)}
                    onShowAll={() => void submitSearch(inputValue)}
                    onRetry={() => searchController.suggestionSearch.refetch()}
                    onManageAddons={() => router.push("/addons")}
                  />
                </View>
              )}
            </View>
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
            <SearchDiscovery
              recentSearches={searchController.recentSearches}
              onSelectRecentSearch={(query) => void submitSearch(query)}
              onRemoveRecentSearch={(query) =>
                void searchController.removeRecentSearch(query)
              }
              onClearRecentSearches={() =>
                void searchController.clearRecentSearches()
              }
              onManageAddons={() => router.push("/addons")}
            />
          ) : (
            <View style={styles.resultsPage}>
              <View style={styles.resultsHeading}>
                <Text
                  key={submittedQuery}
                  accessibilityLiveRegion="polite"
                  style={[styles.resultsTitle, { color: colors.text }]}
                >
                  {resultState === "loading-results"
                    ? isPreparingFilteredResults
                      ? t("search.results.preparingFilters", {
                          count: results.length,
                        })
                      : t("search.results.searching", {
                          query: submittedQuery,
                        })
                    : resultState === "filter-pagination-limit"
                      ? t("search.states.filterLimitTitle")
                      : t("search.results.summary", {
                          count:
                            secondaryFilterCount > 0
                              ? filteredResults.length
                              : (fullSearch.data?.total ??
                                filteredResults.length),
                          query: submittedQuery,
                        })}
                </Text>
                {resultState !== "loading-results" &&
                  resultState !== "filter-pagination-limit" && (
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

              <View style={styles.toolbar}>
                <ContentTabs
                  testID="search-results-type-tabs"
                  variant="segmented"
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  style={styles.typeFilter}
                  accessibilityLabel={t("search.filters.type")}
                />
                {!isLarge &&
                  resultState !== "loading-results" &&
                  resultState !== "filter-pagination-limit" && (
                    <View style={styles.toolbarActions}>
                      <SearchToolbarButton
                        testID="search-filter-toggle"
                        onPress={() => setFiltersOpen(true)}
                        accessibilityLabel={t("search.filters.open")}
                        icon="options-outline"
                        label={`${t("search.filters.button")}${
                          secondaryFilterCount > 0
                            ? ` ${secondaryFilterCount}`
                            : ""
                        }`}
                      />
                      <SearchToolbarButton
                        onPress={() => setFiltersOpen(true)}
                        accessibilityLabel={t("search.filters.sortBy", {
                          sort: sortLabel,
                        })}
                        icon="swap-vertical-outline"
                        label={sortLabel}
                      />
                    </View>
                  )}
              </View>

              {fullSearch.data?.partial &&
                fullSearch.data.failedProviderIds.length > 0 &&
                resultState !== "loading-results" &&
                resultState !== "filter-pagination-limit" && (
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

              {fullSearch.data?.truncated &&
                resultState !== "loading-results" &&
                resultState !== "filter-pagination-limit" && (
                  <View
                    style={[
                      styles.partialBanner,
                      { backgroundColor: colors.tint + "10" },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={19}
                      color={colors.tint}
                    />
                    <Text style={[styles.partialText, { color: colors.text }]}>
                      {t("search.states.truncated")}
                    </Text>
                  </View>
                )}

              <View style={styles.resultsLayout}>
                {isLarge &&
                  (resultState === "results" ||
                    resultState === "partial-results" ||
                    resultState === "truncated-results" ||
                    outcome === "filter-empty") && (
                    <FilterSidebar {...filterProps} />
                  )}
                <View style={styles.resultsMain}>
                  {resultState === "loading-results" && (
                    <View style={styles.loadingState}>
                      <ActivityIndicator size="large" color={colors.tint} />
                      <Text
                        style={[
                          styles.loadingLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {isPreparingFilteredResults
                          ? t("search.results.preparingFilters", {
                              count: results.length,
                            })
                          : t("search.results.searching", {
                              query: submittedQuery,
                            })}
                      </Text>
                    </View>
                  )}
                  {resultState === "transport-error" && (
                    <EmptyState
                      icon="cloud-offline-outline"
                      title={t("search.states.errorTitle")}
                      description={t("search.states.errorDescription")}
                      actionLabel={t("common.retry")}
                      onAction={retryFullSearch}
                    />
                  )}
                  {resultState === "filter-pagination-limit" && (
                    <EmptyState
                      icon="options-outline"
                      title={t("search.states.filterLimitTitle")}
                      description={t("search.states.filterLimitDescription")}
                      actionLabel={t("search.filters.reset")}
                      onAction={resetFilters}
                    />
                  )}
                  {resultState === "provider-unavailable" && (
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
                  {resultState === "no-search-provider" && (
                    <EmptyState
                      icon="extension-puzzle-outline"
                      title={t("search.states.noSearchProviderTitle")}
                      description={t(
                        "search.states.noSearchProviderDescription",
                      )}
                      actionLabel={t("search.discovery.manageAddons")}
                      onAction={() => router.push("/addons")}
                    />
                  )}
                  {resultState === "no-results" && outcome === "no-match" && (
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
                  {resultState === "no-results" &&
                    outcome === "filter-empty" && (
                      <EmptyState
                        icon="options-outline"
                        title={t("search.states.filterEmptyTitle")}
                        description={t("search.states.filterEmptyDescription")}
                        actionLabel={t("search.filters.reset")}
                        onAction={resetFilters}
                      />
                    )}
                  {(resultState === "results" ||
                    resultState === "partial-results" ||
                    resultState === "truncated-results") && (
                    <>
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
                      {(fullSearch.hasNextPage || hasInlineNextPageError) &&
                        secondaryFilterCount === 0 && (
                          <SearchLoadMoreButton
                            onPress={() => void fullSearch.fetchNextPage()}
                            loading={fullSearch.isFetchingNextPage}
                            retry={hasInlineNextPageError}
                          />
                        )}
                    </>
                  )}
                </View>
              </View>
            </View>
          )}
        </ContentBoundary>
      </ScrollView>

      <FilterSheet
        visible={
          filtersOpen &&
          !isLarge &&
          resultState !== "loading-results" &&
          resultState !== "filter-pagination-limit"
        }
        onClose={() => setFiltersOpen(false)}
        {...filterProps}
      />
    </PageLayout>
  );
}

function SearchToolbarButton({
  testID,
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  testID?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(onPress);

  return (
    <Pressable
      {...webPressableProps}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }: any) => [
        styles.toolbarButton,
        { backgroundColor: colors.card },
        pressed && styles.pressed,
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
      ]}
    >
      <Ionicons name={icon} size={17} color={colors.text} />
      <Text style={[styles.toolbarButtonText, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SearchLoadMoreButton({
  loading,
  retry = false,
  onPress,
}: {
  loading: boolean;
  retry?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(onPress);

  return (
    <Pressable
      {...webPressableProps}
      testID="search-load-more"
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      accessibilityLabel={
        retry ? t("common.retry") : t("search.results.loadMore")
      }
      style={({ pressed }: any) => [
        styles.loadMore,
        {
          borderColor: colors.border,
          opacity: loading ? 0.6 : pressed ? 0.72 : 1,
        },
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.tint} /> : null}
      <Text style={[styles.loadMoreText, { color: colors.text }]}>
        {loading
          ? t("search.results.loadingMore")
          : retry
            ? t("common.retry")
            : t("search.results.loadMore")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    zIndex: 20,
  },
  stickyHeaderContent: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
  },
  heading: { alignItems: "flex-start", gap: 18 },
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
  searchAreaCompact: {
    width: "100%",
    minWidth: 0,
  },
  pageSearchField: { minHeight: 60, paddingHorizontal: 18 },
  suggestions: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 68,
    maxHeight: 500,
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 30,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 44px rgba(0,0,0,0.32)" }
      : { elevation: 14 }),
  } as any,
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 64 },
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
  resultsHeading: { marginTop: 4, marginBottom: 14, gap: 3 },
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
  loadMore: {
    alignSelf: "center",
    minHeight: 44,
    minWidth: 144,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
