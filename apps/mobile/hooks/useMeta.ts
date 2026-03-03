import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { MetaDetail } from '@streamer/shared';
import { useAuthStore } from '../stores/authStore';

export function useMeta(type: string, id: string) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    return useQuery<MetaDetail>({
        queryKey: ['meta', type, id],
        queryFn: async () => {
            const { data } = await api.get(`/api/meta/${type}/${id}`);
            return data.meta;
        },
        staleTime: 10 * 60 * 1000, // 10 min cache — meta rarely changes
        gcTime: 60 * 60 * 1000,    // Keep for 1 hour
        retry: 2,
        refetchOnReconnect: true,
        enabled: isAuthenticated && !!type && !!id,
    });
}
