import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { InstalledAddon } from '@streamer/shared';
import { useAuthStore } from '../stores/authStore';

export function useAddons() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    return useQuery<InstalledAddon[]>({
        queryKey: ['addons'],
        queryFn: async () => {
            const { data } = await api.get('/api/addons');
            return data.addons;
        },
        enabled: isAuthenticated,
        staleTime: 2 * 60 * 1000, // 2 min cache
    });
}
