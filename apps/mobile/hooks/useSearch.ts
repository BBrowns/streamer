import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export interface SearchMetaPreview extends MetaPreview {
  providerIds: string[];
  providerNames: string[];
}

interface SearchApiResponse {
  metas?: MetaPreview[];
  providers?: Array<{ id: string; name: string }>;
  providersByContent?: Record<string, string[]>;
}

export function useSearch(
  query: string,
  options: { minimumLength?: number } = {},
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const minimumLength = options.minimumLength ?? 1;

  return useQuery<SearchMetaPreview[]>({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!query || query.trim().length === 0) return [];

      const { data } = await api.get<SearchApiResponse>(
        `/api/search?q=${encodeURIComponent(query)}`,
      );
      const providerNames = new Map(
        (data.providers ?? []).map((provider) => [provider.id, provider.name]),
      );
      return (data.metas || []).map((meta) => {
        const ids = data.providersByContent?.[`${meta.type}:${meta.id}`] ?? [];
        return {
          ...meta,
          providerIds: ids,
          providerNames: ids.map((id) => providerNames.get(id) ?? id),
        };
      });
    },
    enabled: isAuthenticated && query.trim().length >= minimumLength,
    staleTime: 2 * 60 * 1000, // 2 min cache
    retry: 1,
  });
}
