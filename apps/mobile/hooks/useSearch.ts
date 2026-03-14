import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export function useSearch(query: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<MetaPreview[]>({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!query || query.trim().length === 0) return [];
      const { data } = await api.get(
        `/api/search?q=${encodeURIComponent(query)}`,
      );
      return data.metas || [];
    },
    enabled: isAuthenticated && query.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
