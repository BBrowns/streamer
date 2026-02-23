import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { MetaPreview } from '@streamer/shared';

export function useCatalog(type: string, search?: string) {
    return useQuery<MetaPreview[]>({
        queryKey: ['catalog', type, search],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);

            const { data } = await api.get(`/api/catalog/${type}?${params}`);
            return data.metas;
        },
        staleTime: 5 * 60 * 1000, // 5 min cache
        retry: 2,
    });
}
