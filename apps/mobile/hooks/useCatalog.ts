import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export function useCatalog(type: string, search?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<MetaPreview[]>({
    queryKey: ["catalog", type, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      const { data } = await api.get(`/api/catalog/${type}?${params}`);
      return data.metas;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 30 * 60 * 1000, // Keep for 30 min
    retry: 2,
    refetchOnReconnect: true,
  });
}
