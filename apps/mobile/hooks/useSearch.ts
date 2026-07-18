import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MetaPreview, SearchResponse } from "@streamer/shared";
import { api } from "../services/api";
import { normalizeSearchQueryInput } from "../services/searchController";
import { useAuthStore } from "../stores/authStore";

export interface SearchMetaPreview extends MetaPreview {
  providerIds: string[];
  providerNames: string[];
}

export interface SearchResults extends Omit<
  SearchResponse,
  "metas" | "providersByContent"
> {
  metas: SearchMetaPreview[];
  providersByContent: Record<string, string[]>;
}

const EMPTY_SEARCH_RESULTS: SearchResults = {
  metas: [],
  total: 0,
  providers: [],
  providersByContent: {},
  attemptedProviders: 0,
  successfulProviders: 0,
  failedProviderIds: [],
  partial: false,
  truncated: false,
};

export type SearchRequestMode = "suggestions" | "results";
export type SearchRequestType = "all" | "movie" | "series";

export interface UseSearchOptions {
  minimumLength?: number;
  limit?: number;
  mode?: SearchRequestMode;
  type?: SearchRequestType;
  cursor?: string;
  enabled?: boolean;
}

async function fetchSearchResults(
  cleanQuery: string,
  options: {
    mode: SearchRequestMode;
    type: SearchRequestType;
    limit: number;
    cursor?: string;
    signal: AbortSignal;
  },
): Promise<SearchResults> {
  if (!cleanQuery) return EMPTY_SEARCH_RESULTS;

  const params = new URLSearchParams({
    q: cleanQuery,
    mode: options.mode,
    type: options.type,
    limit: String(options.limit),
  });
  if (options.cursor) params.set("cursor", options.cursor);

  const { data } = await api.get<SearchResponse>(
    `/api/search?${params.toString()}`,
    { signal: options.signal },
  );
  const providerNames = new Map(
    (data.providers ?? []).map((provider) => [provider.id, provider.name]),
  );
  const metas = (data.metas ?? []).map((meta) => {
    const ids = data.providersByContent?.[`${meta.type}:${meta.id}`] ?? [];
    return {
      ...meta,
      providerIds: ids,
      providerNames: ids.map((id) => providerNames.get(id) ?? id),
    };
  });

  return {
    ...data,
    metas,
    total: data.total ?? metas.length,
    providers: data.providers ?? [],
    providersByContent: data.providersByContent ?? {},
    attemptedProviders: data.attemptedProviders ?? 0,
    successfulProviders: data.successfulProviders ?? 0,
    failedProviderIds: data.failedProviderIds ?? [],
    partial: data.partial ?? false,
    truncated: data.truncated ?? false,
  };
}

export function mergeSearchResultPages(
  pages: readonly SearchResults[],
): SearchResults | undefined {
  if (pages.length === 0) return undefined;

  const first = pages[0];
  const last = pages[pages.length - 1];
  const metas = new Map<string, SearchMetaPreview>();
  const providers = new Map<string, SearchResults["providers"][number]>();
  const providersByContent = new Map<string, Set<string>>();
  const failedProviderIds = new Set<string>();

  for (const page of pages) {
    for (const meta of page.metas) {
      metas.set(`${meta.type}:${meta.id}`, meta);
    }
    for (const provider of page.providers) providers.set(provider.id, provider);
    for (const [key, ids] of Object.entries(page.providersByContent)) {
      const merged = providersByContent.get(key) ?? new Set<string>();
      ids.forEach((id) => merged.add(id));
      providersByContent.set(key, merged);
    }
    page.failedProviderIds.forEach((id) => failedProviderIds.add(id));
  }

  return {
    ...first,
    metas: Array.from(metas.values()),
    providers: Array.from(providers.values()),
    providersByContent: Object.fromEntries(
      Array.from(providersByContent, ([key, ids]) => [key, Array.from(ids)]),
    ),
    failedProviderIds: Array.from(failedProviderIds),
    attemptedProviders: Math.max(
      ...pages.map((page) => page.attemptedProviders),
    ),
    successfulProviders: Math.max(
      ...pages.map((page) => page.successfulProviders),
    ),
    partial: pages.some((page) => page.partial),
    truncated: pages.some((page) => page.truncated),
    nextCursor: last.nextCursor,
  };
}

export function useSearch(query: string, options: UseSearchOptions = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const minimumLength = options.minimumLength ?? 1;
  const cleanQuery = normalizeSearchQueryInput(query);
  const mode = options.mode ?? "results";
  const type = options.type ?? "all";
  const limit = options.limit ?? (mode === "suggestions" ? 6 : 40);

  return useQuery<SearchResults>({
    queryKey: ["search", cleanQuery, mode, type, limit, options.cursor ?? ""],
    queryFn: ({ signal }) =>
      fetchSearchResults(cleanQuery, {
        mode,
        type,
        limit,
        cursor: options.cursor,
        signal,
      }),
    enabled:
      options.enabled !== false &&
      isAuthenticated &&
      cleanQuery.length >= minimumLength,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

/** Cursor-aware full-result retrieval with one aggregated result surface. */
export function useInfiniteSearch(
  query: string,
  options: Omit<UseSearchOptions, "cursor"> = {},
) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const minimumLength = options.minimumLength ?? 1;
  const cleanQuery = normalizeSearchQueryInput(query);
  const mode = options.mode ?? "results";
  const type = options.type ?? "all";
  const limit = options.limit ?? (mode === "suggestions" ? 6 : 40);
  const result = useInfiniteQuery({
    queryKey: ["search", cleanQuery, mode, type, limit, "infinite"],
    queryFn: ({ signal, pageParam }) =>
      fetchSearchResults(cleanQuery, {
        mode,
        type,
        limit,
        cursor: pageParam || undefined,
        signal,
      }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:
      options.enabled !== false &&
      isAuthenticated &&
      cleanQuery.length >= minimumLength,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  return {
    ...result,
    data: mergeSearchResultPages(result.data?.pages ?? []),
    pageCount: result.data?.pages.length ?? 0,
  };
}
