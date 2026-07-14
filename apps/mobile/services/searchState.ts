export type SearchTypeFilter = "all" | "movie" | "series";
export type SearchSort = "relevance" | "title" | "year";

export interface SearchRouteState {
  q: string;
  type: SearchTypeFilter;
  year: string;
  provider: string;
  sort: SearchSort;
  mode?: "discover";
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearchRouteState(
  params: Record<string, string | string[] | undefined>,
): SearchRouteState {
  const type = first(params.type);
  const sort = first(params.sort);
  const mode = first(params.mode);

  return {
    q: first(params.q)?.trim() ?? "",
    type: type === "movie" || type === "series" ? type : "all",
    year: /^\d{4}$/.test(first(params.year) ?? "")
      ? first(params.year)!
      : "all",
    provider: first(params.provider)?.trim() || "all",
    sort: sort === "title" || sort === "year" ? sort : "relevance",
    mode: mode === "discover" ? "discover" : undefined,
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
    sort: state.sort === "relevance" ? undefined : state.sort,
    mode: state.mode,
  };
}
