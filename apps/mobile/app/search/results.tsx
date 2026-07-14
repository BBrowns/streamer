import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type {
  CatalogDefinition,
  InstalledAddon,
  MetaPreview,
} from "@streamer/shared";
import { useSearch } from "../../hooks/useSearch";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";
import { CatalogRow } from "../../components/catalog/CatalogRow";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { SkeletonRow } from "../../components/ui/SkeletonLoader";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { Surface } from "../../components/ui/Surface";
import { AppButton } from "../../components/ui/AppButton";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../../components/ui/designSystem";
import { hapticImpactLight } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { SearchService } from "../../services/SearchService";
import { useAddons } from "../../hooks/useAddons";
import { useWindowClass } from "../../hooks/useWindowClass";
import {
  parseSearchRouteState,
  searchRouteParams,
  type SearchSort,
  type SearchTypeFilter,
} from "../../services/searchState";

type YearFilter = "all" | string;

function extractYear(item: MetaPreview) {
  const match = item.releaseInfo?.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function uniqueYears(items: MetaPreview[]) {
  return Array.from(
    new Set(items.map(extractYear).filter((year): year is string => !!year)),
  )
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, 8);
}

function resultSummary(count: number, query: string) {
  if (!query.trim()) return "Search movies and shows across your add-ons.";
  if (count === 1) return `1 result for "${query}"`;
  return `${count} results for "${query}"`;
}

function DiscoverCatalogRows({ type }: { type: SearchTypeFilter }) {
  const { data: addons, isLoading } = useAddons();
  const { colors } = useTheme();
  const rows = useMemo(() => {
    const catalogRows: Array<{
      catalog: CatalogDefinition;
      addon: InstalledAddon;
    }> = [];
    [...(addons ?? [])]
      .sort((left, right) => left.installedAt.localeCompare(right.installedAt))
      .forEach((addon) => {
        addon.manifest.catalogs.forEach((catalog) => {
          if (
            (catalog.type === "movie" || catalog.type === "series") &&
            (type === "all" || catalog.type === type)
          ) {
            catalogRows.push({ addon, catalog });
          }
        });
      });
    return catalogRows;
  }, [addons, type]);

  if (isLoading) return <SkeletonRow />;
  if (rows.length === 0) {
    return (
      <Text style={[styles.discoverEmpty, { color: colors.textSecondary }]}>
        Install a provider to browse its catalogs here.
      </Text>
    );
  }

  return (
    <View style={styles.discoverRows}>
      {rows.map(({ addon, catalog }) => (
        <CatalogRow
          key={`search-${addon.id}-${catalog.type}-${catalog.id}`}
          addon={addon}
          catalog={catalog}
        />
      ))}
    </View>
  );
}

export default function SearchResultsScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    type?: string;
    year?: string;
    sort?: string;
    mode?: string;
  }>();
  const routeState = parseSearchRouteState(params);
  const router = useRouter();
  const numColumns = useResponsiveColumns();
  const { colors, isDark } = useTheme();
  const { isExpanded, isLarge } = useWindowClass();
  const initialQuery = routeState.q;
  const [inputValue, setInputValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(
    routeState.type,
  );
  const [yearFilter, setYearFilter] = useState<YearFilter>(routeState.year);
  const [sort, setSort] = useState<SearchSort>(routeState.sort);
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useSearch(submittedQuery);

  const results = data ?? [];
  const years = useMemo(() => uniqueYears(results), [results]);
  const filteredResults = useMemo(() => {
    const filtered = results.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (yearFilter !== "all" && extractYear(item) !== yearFilter) {
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
  }, [results, sort, typeFilter, yearFilter]);

  const loadRecent = useCallback(async () => {
    setRecentSearches(await SearchService.getRecentSearches());
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    setInputValue(initialQuery);
    setSubmittedQuery(initialQuery);
    setTypeFilter(routeState.type);
    setYearFilter(routeState.year);
    setSort(routeState.sort);
  }, [initialQuery, routeState.sort, routeState.type, routeState.year]);

  const syncRoute = useCallback(
    (overrides: Partial<Parameters<typeof searchRouteParams>[0]>) => {
      router.setParams(
        searchRouteParams({
          q: submittedQuery,
          type: typeFilter,
          year: yearFilter,
          sort,
          mode: routeState.mode,
          ...overrides,
        }) as any,
      );
    },
    [routeState.mode, router, sort, submittedQuery, typeFilter, yearFilter],
  );

  useEffect(() => {
    if (yearFilter !== "all" && !years.includes(yearFilter)) {
      setYearFilter("all");
    }
  }, [yearFilter, years]);

  const submitSearch = useCallback(
    async (query: string) => {
      const clean = query.trim();
      if (!clean) return;
      hapticImpactLight();
      setInputValue(clean);
      setSubmittedQuery(clean);
      setTypeFilter("all");
      setYearFilter("all");
      await SearchService.addRecentSearch(clean);
      await loadRecent();
      syncRoute({ q: clean, type: "all", year: "all", sort: "relevance" });
    },
    [loadRecent, syncRoute],
  );

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

  const typeOptions = [
    { label: "All", value: "all" as const },
    { label: "Movies", value: "movie" as const },
    { label: "Series", value: "series" as const },
  ];
  const yearOptions = [
    { label: "Any year", value: "all" as const },
    ...years.map((year) => ({ label: year, value: year })),
  ];
  const sortOptions = [
    { label: "Relevant", value: "relevance" as const },
    { label: "A–Z", value: "title" as const },
    { label: "Newest", value: "year" as const },
  ];

  const showSuggestions =
    inputValue.trim().length > 0 && inputValue.trim() !== submittedQuery.trim();
  const showRecent = !submittedQuery.trim() && recentSearches.length > 0;
  const showEmptyLanding =
    !submittedQuery.trim() && recentSearches.length === 0;
  const showFilters = submittedQuery.trim().length > 0 && results.length > 0;
  const showInlineFilterPanel = isExpanded || isLarge;
  const activeAdvancedFilterCount =
    Number(yearFilter !== "all") + Number(sort !== "relevance");

  const advancedFilterControls = (
    <>
      <View style={styles.filterPanelHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Filters
          </Text>
          <Text
            style={[
              styles.filterPanelSubtitle,
              { color: colors.textSecondary },
            ]}
          >
            Refine and sort these results
          </Text>
        </View>
        {!showInlineFilterPanel && (
          <Pressable
            onPress={() => setFiltersOpen(false)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        )}
      </View>
      {years.length > 0 && (
        <FilterChipBar
          options={yearOptions}
          value={yearFilter}
          onChange={(value) => {
            setYearFilter(value);
            syncRoute({ year: value });
          }}
          containerStyle={styles.filterBar}
          accessibilityLabel="Filter search results by year"
        />
      )}
      <FilterChipBar
        options={sortOptions}
        value={sort}
        onChange={(value) => {
          setSort(value);
          syncRoute({ sort: value });
        }}
        containerStyle={styles.filterBar}
        accessibilityLabel="Sort search results"
      />
      <AppButton
        label="Reset filters"
        variant="secondary"
        size="small"
        onPress={() => {
          setYearFilter("all");
          setSort("relevance");
          syncRoute({ year: "all", sort: "relevance" });
        }}
      />
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredResults}
        keyExtractor={(item) => item.id}
        key={`search-grid-${numColumns}`}
        numColumns={numColumns}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <Surface
              style={[
                styles.searchSurface,
                Platform.OS === "web" &&
                  searchFocused &&
                  getWebFocusStyle(colors.focus),
              ]}
            >
              <Ionicons name="search" size={20} color={colors.textSecondary} />
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={() => submitSearch(inputValue)}
                placeholder="Search movies, shows..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search movies and shows"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={[styles.input, { color: colors.text }]}
              />
              {inputValue.length > 0 && (
                <Pressable
                  onPress={() => {
                    setInputValue("");
                    setSubmittedQuery("");
                    setTypeFilter("all");
                    setYearFilter("all");
                    setSort("relevance");
                    syncRoute({
                      q: "",
                      type: "all",
                      year: "all",
                      sort: "relevance",
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.iconButton}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              )}
            </Surface>

            {showSuggestions && (
              <Surface variant="accent" style={styles.suggestionSurface}>
                <View style={styles.suggestionCopy}>
                  <Text
                    style={[styles.suggestionTitle, { color: colors.text }]}
                  >
                    Search for "{inputValue.trim()}"
                  </Text>
                  <Text
                    style={[
                      styles.suggestionSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Results are ranked by your installed add-ons.
                  </Text>
                </View>
                <AppButton
                  label="Search"
                  icon="search"
                  size="small"
                  variant="primary"
                  onPress={() => submitSearch(inputValue)}
                />
              </Surface>
            )}

            {showRecent && (
              <Surface style={styles.recentSurface}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Recent searches
                  </Text>
                  <Pressable
                    onPress={clearRecent}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                    style={styles.clearButton}
                  >
                    <Text style={[styles.clearText, { color: colors.tint }]}>
                      Clear
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.recentList}>
                  {recentSearches.map((item) => (
                    <View key={item} style={styles.recentRow}>
                      <Pressable
                        onPress={() => submitSearch(item)}
                        style={({ pressed, hovered }: any) => [
                          styles.recentMain,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.055)"
                              : "rgba(30,25,45,0.045)",
                            borderColor: colors.border,
                          },
                          Platform.OS === "web" &&
                            hovered && { borderColor: colors.tint },
                          pressed && { opacity: 0.78 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Search for ${item}`}
                      >
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={[styles.recentText, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removeRecent(item)}
                        style={styles.removeRecent}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item}`}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Surface>
            )}

            {showEmptyLanding && (
              <Surface variant="accent" style={styles.landingSurface}>
                <Ionicons
                  name="sparkles-outline"
                  size={24}
                  color={colors.tint}
                />
                <View style={styles.landingCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Search every source at once
                  </Text>
                  <Text
                    style={[
                      styles.landingText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Find movies and series without choosing a provider first.
                  </Text>
                </View>
              </Surface>
            )}

            {routeState.mode === "discover" && !submittedQuery.trim() && (
              <View style={styles.discoverSection}>
                <View style={styles.summaryBlock}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>
                    Browse providers
                  </Text>
                  <Text
                    style={[
                      styles.summarySubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Catalog order follows your installed provider order.
                  </Text>
                </View>
                <FilterChipBar
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  containerStyle={styles.filterBar}
                  accessibilityLabel="Filter provider catalogs by type"
                />
                <DiscoverCatalogRows type={typeFilter} />
              </View>
            )}

            {submittedQuery.trim().length > 0 && (
              <View style={styles.summaryBlock}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.summaryTitle, { color: colors.text }]}
                >
                  {resultSummary(filteredResults.length, submittedQuery)}
                </Text>
                <Text
                  style={[
                    styles.summarySubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Source details stay hidden until an advanced flow needs them.
                </Text>
              </View>
            )}

            {showFilters && (
              <View style={styles.filters}>
                <FilterChipBar
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(value);
                    syncRoute({ type: value });
                  }}
                  containerStyle={styles.filterBar}
                  accessibilityLabel="Filter search results by type"
                />
                {showInlineFilterPanel ? (
                  <Surface style={styles.inlineFilterPanel}>
                    {advancedFilterControls}
                  </Surface>
                ) : (
                  <View style={styles.filterButtonWrap}>
                    <AppButton
                      label={`Filters${activeAdvancedFilterCount ? ` (${activeAdvancedFilterCount})` : ""}`}
                      icon="options-outline"
                      variant="secondary"
                      size="small"
                      onPress={() => setFiltersOpen(true)}
                    />
                  </View>
                )}
              </View>
            )}

            {isLoading && (
              <View style={styles.skeletonWrap}>
                <SkeletonCardGrid count={12} />
              </View>
            )}

            {isError && (
              <View style={styles.stateWrap}>
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Search could not load"
                  description="Refresh the search or check your connection."
                  actionLabel="Retry"
                  onAction={() => refetch()}
                />
              </View>
            )}

            {!isLoading &&
              !isError &&
              submittedQuery.trim().length > 0 &&
              results.length === 0 && (
                <View style={styles.stateWrap}>
                  <EmptyState
                    icon="search"
                    title="No results found"
                    description={`Nothing matched "${submittedQuery}". Try another title or clear the filters.`}
                    actionLabel="Clear search"
                    onAction={() => {
                      setInputValue("");
                      setSubmittedQuery("");
                      syncRoute({
                        q: "",
                        type: "all",
                        year: "all",
                        sort: "relevance",
                      });
                    }}
                  />
                </View>
              )}

            {!isLoading &&
              !isError &&
              results.length > 0 &&
              filteredResults.length === 0 && (
                <View style={styles.stateWrap}>
                  <EmptyState
                    icon="filter-outline"
                    title="No matches for these filters"
                    description="Clear a filter to see the rest of the results."
                    actionLabel="Clear filters"
                    onAction={() => {
                      setTypeFilter("all");
                      setYearFilter("all");
                      setSort("relevance");
                      syncRoute({
                        type: "all",
                        year: "all",
                        sort: "relevance",
                      });
                    }}
                  />
                </View>
              )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <CatalogItemCard item={item} />
          </View>
        )}
      />
      <Modal
        visible={filtersOpen && !showInlineFilterPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={[styles.modalScrim, { backgroundColor: colors.scrim }]}
          onPress={() => setFiltersOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        >
          <Pressable
            style={[
              styles.filterSheet,
              { backgroundColor: colors.surfaceElevated },
            ]}
            onPress={() => {}}
          >
            {advancedFilterControls}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 48,
  },
  headerContent: {
    paddingTop: uiSpacing.lg,
  },
  searchSurface: {
    marginHorizontal: uiSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
    paddingVertical: uiSpacing.md,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  iconButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionSurface: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  suggestionTitle: {
    ...uiTypography.control,
  },
  suggestionSubtitle: {
    ...uiTypography.caption,
    marginTop: 2,
  },
  recentSurface: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: uiSpacing.md,
  },
  sectionTitle: {
    ...uiTypography.title,
  },
  clearText: {
    ...uiTypography.caption,
  },
  clearButton: {
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  recentList: {
    gap: uiSpacing.sm,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  recentMain: {
    flex: 1,
    minHeight: 44,
    borderRadius: uiRadii.sm,
    borderWidth: 1,
    paddingHorizontal: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  recentText: {
    ...uiTypography.body,
    flex: 1,
  },
  removeRecent: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  landingSurface: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  landingCopy: {
    flex: 1,
    gap: 2,
  },
  landingText: {
    ...uiTypography.body,
  },
  summaryBlock: {
    paddingHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.xxl,
    marginBottom: uiSpacing.sm,
  },
  summaryTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: 0,
  },
  summarySubtitle: {
    ...uiTypography.body,
    marginTop: 4,
  },
  filters: {
    marginTop: uiSpacing.sm,
    marginBottom: uiSpacing.md,
  },
  filterBar: {
    marginTop: 0,
    marginBottom: uiSpacing.sm,
  },
  filterButtonWrap: {
    paddingHorizontal: uiSpacing.lg,
    alignItems: "flex-start",
  },
  inlineFilterPanel: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.sm,
    gap: uiSpacing.sm,
  },
  filterPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
    marginBottom: uiSpacing.sm,
  },
  filterPanelSubtitle: {
    ...uiTypography.caption,
    marginTop: 2,
  },
  modalScrim: {
    flex: 1,
    justifyContent: "flex-end",
  },
  filterSheet: {
    borderTopLeftRadius: uiRadii.lg,
    borderTopRightRadius: uiRadii.lg,
    padding: uiSpacing.lg,
    paddingBottom: 40,
    maxHeight: "80%",
    gap: uiSpacing.sm,
  },
  skeletonWrap: {
    paddingHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.md,
  },
  stateWrap: {
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.xxl,
  },
  gridItem: {
    flex: 1,
    paddingHorizontal: uiSpacing.sm,
    marginBottom: uiSpacing.md,
  },
  columnWrapper: {
    paddingHorizontal: uiSpacing.sm,
  },
  discoverSection: {
    marginTop: uiSpacing.md,
  },
  discoverRows: {
    gap: uiSpacing.sm,
  },
  discoverEmpty: {
    ...uiTypography.body,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.xl,
  },
});
