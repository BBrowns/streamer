import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

/**
 * Search across all installed add-ons simultaneously.
 * Uses the backend /api/search?q= endpoint which broadcasts
 * to all addons via Promise.allSettled and deduplicates by ID.
 */
export function useGlobalSearch(query: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<MetaPreview[]>({
    queryKey: ["search", query],
    queryFn: async () => {
      const { data } = await api.get(
        `/api/search?q=${encodeURIComponent(query)}`,
      );
      return data.metas ?? [];
    },
    enabled: isAuthenticated && query.length >= 2,
    staleTime: 30 * 1000, // 30s cache for search results
    retry: 1,
  });
}
