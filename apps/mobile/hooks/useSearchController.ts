import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SearchService } from "../services/SearchService";
import { useAuthStore } from "../stores/authStore";
import {
  SEARCH_MINIMUM_LENGTH,
  SEARCH_SUGGESTION_LIMIT,
  isCurrentSearchQuery,
  moveSearchSelection,
  normalizeSearchQueryInput,
  type SearchInteractionState,
} from "../services/searchController";
import { useGlobalSearch } from "./useGlobalSearch";

interface UseSearchControllerOptions {
  initialQuery?: string;
  enabled?: boolean;
  suppressedSuggestionQuery?: string;
}

/**
 * Shared interaction model for full-page and command-palette title search.
 * Routing remains with the surface, while query timing, suggestions, selection,
 * and recent-search persistence stay identical.
 */
export function useSearchController({
  initialQuery = "",
  enabled = true,
  suppressedSuggestionQuery = "",
}: UseSearchControllerOptions = {}) {
  const [query, setQueryState] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [deliberatelyNavigated, setDeliberatelyNavigated] = useState(false);
  const recentSearchOwnerId = useAuthStore((state) => state.user?.id ?? null);
  const recentSearchOwnerRef = useRef(recentSearchOwnerId);
  recentSearchOwnerRef.current = recentSearchOwnerId;
  const selectionSnapshotRef = useRef({
    selectedIndex: -1,
    deliberatelyNavigated: false,
  });
  const suggestionsEnabled =
    enabled &&
    normalizeSearchQueryInput(query) !==
      normalizeSearchQueryInput(suppressedSuggestionQuery);
  const search = useGlobalSearch(query, { enabled: suggestionsEnabled });
  const suggestions = useMemo(
    () =>
      isCurrentSearchQuery(query, search.debouncedQuery)
        ? (search.data?.metas.slice(0, SEARCH_SUGGESTION_LIMIT) ?? [])
        : [],
    [query, search.data, search.debouncedQuery],
  );
  const suggestionIdentity = suggestions
    .map((item) => `${item.type}:${item.id}`)
    .join("|");

  const loadRecentSearches = useCallback(async () => {
    const ownerId = recentSearchOwnerId;
    const recent = await SearchService.getRecentSearches(ownerId);
    if (recentSearchOwnerRef.current === ownerId) setRecentSearches(recent);
    return recent;
  }, [recentSearchOwnerId]);

  useEffect(() => {
    setRecentSearches([]);
    if (enabled) void loadRecentSearches();
  }, [enabled, loadRecentSearches]);

  const resetSelection = useCallback(() => {
    selectionSnapshotRef.current = {
      selectedIndex: -1,
      deliberatelyNavigated: false,
    };
    setSelectedIndex(-1);
    setDeliberatelyNavigated(false);
  }, []);

  const setQuery = useCallback(
    (nextQuery: string) => {
      setQueryState(nextQuery);
      resetSelection();
    },
    [resetSelection],
  );
  const clearQuery = useCallback(() => setQuery(""), [setQuery]);

  // Reset in the same commit as a new suggestion set. A passive reset can run
  // after the list is already visible and erase a fast ArrowDown immediately
  // before Enter reads the synchronous selection snapshot.
  useLayoutEffect(() => {
    resetSelection();
  }, [resetSelection, search.debouncedQuery, suggestionIdentity]);

  const rememberSearch = useCallback(
    async (value: string) => {
      const clean = normalizeSearchQueryInput(value);
      if (clean.length < SEARCH_MINIMUM_LENGTH) return false;
      await SearchService.addRecentSearch(clean, recentSearchOwnerId);
      await loadRecentSearches();
      return true;
    },
    [loadRecentSearches, recentSearchOwnerId],
  );

  const removeRecentSearch = useCallback(
    async (value: string) => {
      await SearchService.removeRecentSearch(value, recentSearchOwnerId);
      await loadRecentSearches();
    },
    [loadRecentSearches, recentSearchOwnerId],
  );

  const clearRecentSearches = useCallback(async () => {
    await SearchService.clearRecentSearches(recentSearchOwnerId);
    setRecentSearches([]);
  }, [recentSearchOwnerId]);

  const moveSelection = useCallback(
    (direction: "next" | "previous") => {
      if (query.trim().length < SEARCH_MINIMUM_LENGTH) return;
      const nextIndex = moveSearchSelection(
        selectionSnapshotRef.current.selectedIndex,
        suggestions.length + 1,
        direction,
      );
      selectionSnapshotRef.current = {
        selectedIndex: nextIndex,
        deliberatelyNavigated: true,
      };
      setDeliberatelyNavigated(true);
      setSelectedIndex(nextIndex);
      return nextIndex;
    },
    [query, suggestions.length],
  );

  const getSelectionSnapshot = useCallback(
    () => selectionSnapshotRef.current,
    [],
  );

  let state: SearchInteractionState;
  const cleanQuery = query.trim();
  if (!cleanQuery) state = "idle";
  else if (cleanQuery.length < SEARCH_MINIMUM_LENGTH) state = "typing";
  else if (search.isDebouncing || search.isFetching || search.isLoading) {
    state = "loading-suggestions";
  } else if (search.isError) state = "transport-error";
  else if (search.data?.attemptedProviders === 0) {
    state = "no-search-provider";
  } else if (
    search.data &&
    search.data.successfulProviders === 0 &&
    search.data.failedProviderIds.length > 0
  ) {
    state = "provider-unavailable";
  } else if (search.data?.partial && search.data.failedProviderIds.length > 0) {
    state = "partial-results";
  } else if (search.data?.truncated) state = "truncated-results";
  else if (suggestions.length > 0) state = "suggestions";
  else state = "no-results";

  return {
    query,
    setQuery,
    clearQuery,
    recentSearches,
    rememberSearch,
    removeRecentSearch,
    clearRecentSearches,
    reloadRecentSearches: loadRecentSearches,
    suggestions,
    suggestionSearch: search,
    state,
    selectedIndex,
    deliberatelyNavigated,
    moveSelection,
    getSelectionSnapshot,
    resetSelection,
  };
}
