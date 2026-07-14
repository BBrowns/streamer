import { useQuery } from "@tanstack/react-query";
import type { MetaPreview, SearchResponse } from "@streamer/shared";
import { api } from "../services/api";
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
  providers: [],
  providersByContent: {},
  attemptedProviders: 0,
  successfulProviders: 0,
  failedProviderIds: [],
  partial: false,
};

export function useSearch(
  query: string,
  options: { minimumLength?: number; limit?: number } = {},
) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const minimumLength = options.minimumLength ?? 1;
  const cleanQuery = query.trim();

  return useQuery<SearchResults>({
    queryKey: ["search", cleanQuery, options.limit ?? "all"],
    queryFn: async ({ signal }) => {
      if (!cleanQuery) return EMPTY_SEARCH_RESULTS;

      const { data } = await api.get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(cleanQuery)}`,
        { signal },
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
        metas: options.limit ? metas.slice(0, options.limit) : metas,
        providers: data.providers ?? [],
        providersByContent: data.providersByContent ?? {},
        attemptedProviders: data.attemptedProviders ?? 0,
        successfulProviders: data.successfulProviders ?? 0,
        failedProviderIds: data.failedProviderIds ?? [],
        partial: data.partial ?? false,
      };
    },
    enabled: isAuthenticated && cleanQuery.length >= minimumLength,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
