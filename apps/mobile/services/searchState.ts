import { normalizeSearchQueryInput } from "./searchController";

export type SearchTypeFilter = "all" | "movie" | "series";
export type SearchSort = "default" | "title" | "year";

export interface SearchRouteState {
  q: string;
  type: SearchTypeFilter;
  year: string;
  provider: string;
  sort: SearchSort;
}

export const DEFAULT_SEARCH_FILTERS = {
  type: "all" as const,
  year: "all",
  provider: "all",
  sort: "default" as const,
};

export const MAX_COMPLETE_SEARCH_FILTER_PAGES = 20;

export type SearchFilterPaginationState =
  | "ready"
  | "loading"
  | "limit"
  | "error";

/**
 * Secondary filters and client-side sorting are only correct after every
 * cursor page has been loaded. The page cap prevents a broken or unbounded
 * cursor chain from leaving Search in a permanent loading loop.
 */
export function getSearchFilterPaginationState(input: {
  activeSecondaryFilterCount: number;
  hasNextPage: boolean;
  pageCount: number;
  isNextPageError: boolean;
  maxPageCount?: number;
}): SearchFilterPaginationState {
  if (input.activeSecondaryFilterCount <= 0) return "ready";
  if (input.isNextPageError) return "error";
  if (!input.hasNextPage) return "ready";
  if (
    input.pageCount >= (input.maxPageCount ?? MAX_COMPLETE_SEARCH_FILTER_PAGES)
  ) {
    return "limit";
  }
  return "loading";
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearchRouteState(
  params: Record<string, string | string[] | undefined>,
): SearchRouteState {
  const type = first(params.type);
  const sort = first(params.sort);
  return {
    q: normalizeSearchQueryInput(first(params.q) ?? ""),
    type: type === "movie" || type === "series" ? type : "all",
    year: /^\d{4}$/.test(first(params.year) ?? "")
      ? first(params.year)!
      : "all",
    provider: first(params.provider)?.trim() || "all",
    // `relevance` is retained as a backwards-compatible alias.
    sort: sort === "title" || sort === "year" ? sort : "default",
  };
}

export function searchRouteParams(
  state: Omit<SearchRouteState, "provider"> & { provider?: string },
) {
  return {
    q: state.q || undefined,
    type: state.type === "all" ? undefined : state.type,
    year: state.year === "all" ? undefined : state.year,
    provider: state.provider === "all" ? undefined : state.provider,
    sort: state.sort === "default" ? undefined : state.sort,
  };
}

export function legacySearchRedirectParams(
  params: Record<string, string | string[] | undefined>,
) {
  return searchRouteParams(parseSearchRouteState(params));
}

export function clearSearchFilters(): typeof DEFAULT_SEARCH_FILTERS {
  return { ...DEFAULT_SEARCH_FILTERS };
}

export function countActiveSearchFilters(
  state: Pick<SearchRouteState, "type" | "year" | "provider" | "sort">,
) {
  return (
    Number(state.type !== "all") +
    Number(state.year !== "all") +
    Number(state.provider !== "all") +
    Number(state.sort !== "default")
  );
}

export type SearchOutcome =
  | "loading"
  | "transport-error"
  | "no-providers"
  | "provider-error"
  | "no-match"
  | "filter-empty"
  | "results";

export function getSearchOutcome(input: {
  isLoading: boolean;
  isError: boolean;
  attemptedProviders: number;
  successfulProviders: number;
  failedProviderCount: number;
  resultCount: number;
  filteredResultCount: number;
  activeFilterCount: number;
  unfilteredResultCount?: number;
}): SearchOutcome {
  if (input.isLoading) return "loading";
  if (input.isError) return "transport-error";
  if (input.attemptedProviders === 0) return "no-providers";
  if (input.successfulProviders === 0 && input.failedProviderCount > 0) {
    return "provider-error";
  }
  if (
    input.resultCount === 0 &&
    input.activeFilterCount > 0 &&
    (input.unfilteredResultCount ?? 0) > 0
  ) {
    return "filter-empty";
  }
  if (input.resultCount === 0) return "no-match";
  if (input.filteredResultCount === 0 && input.activeFilterCount > 0) {
    return "filter-empty";
  }
  return "results";
}
