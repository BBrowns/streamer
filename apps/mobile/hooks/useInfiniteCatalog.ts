import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

const PAGE_SIZE = 20;

export function useInfiniteCatalog(type: string, search?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useInfiniteQuery<{ metas: MetaPreview[] }>({
    queryKey: ["catalog", type, search, "infinite"],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (pageParam) params.set("skip", String(pageParam));

      const { data } = await api.get(`/api/catalog/${type}?${params}`);
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.metas || lastPage.metas.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length * PAGE_SIZE;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}
