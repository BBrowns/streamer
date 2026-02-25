import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { MetaPreview } from '@streamer/shared';
import { useAuthStore } from '../stores/authStore';

/**
 * Fetch a specific catalog type from the aggregator.
 * Used by the Discover screen to populate each catalog row.
 */
export function useAddonCatalog(type: string, search?: string) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    return useQuery<MetaPreview[]>({
        queryKey: ['catalog', type, search],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);

            const qs = params.toString();
            const { data } = await api.get(`/api/catalog/${type}${qs ? `?${qs}` : ''}`);
            return data.metas ?? [];
        },
        enabled: isAuthenticated,
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });
}
