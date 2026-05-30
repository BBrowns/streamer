import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { CatalogDefinition, MetaPreview } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

/**
 * Fetch one exact catalog from one installed add-on.
 * Used by the Discover screen to populate each catalog row.
 */
export function useAddonCatalog(
  addonId?: string,
  catalog?: CatalogDefinition,
  search?: string,
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useInfiniteQuery<MetaPreview[]>({
    queryKey: ["catalog", "addon", addonId, catalog?.type, catalog?.id, search],
    queryFn: async ({ pageParam }) => {
      const skip = pageParam as number;
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (skip > 0) params.set("skip", skip.toString());

      const qs = params.toString();
      const { data } = await api.get(
        `/api/addons/${addonId}/catalog/${catalog?.type}/${catalog?.id}${qs ? `?${qs}` : ""}`,
      );
      return data.metas ?? [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Stremio addons usually return empty arrays when end is reached
      if (!lastPage || lastPage.length === 0) return undefined;
      // The overall length of all items fetched so far dictates the next `skip` offset.
      return allPages.flat().length;
    },
    enabled: isAuthenticated && !!addonId && !!catalog?.type && !!catalog?.id,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
