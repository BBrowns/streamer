import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import type { WatchProgress, UpdateProgressRequest } from '@streamer/shared';

/** Query key factory */
const progressKeys = {
    all: ['progress'] as const,
    continueWatching: () => [...progressKeys.all, 'continue'] as const,
};

/** Fetch the continue-watching list (items < 95% completed) */
export function useContinueWatching() {
    return useQuery({
        queryKey: progressKeys.continueWatching(),
        queryFn: async () => {
            const { data } = await api.get<{ items: WatchProgress[] }>('/api/library/progress');
            return data.items;
        },
        // Refetch when screen is focused to catch progress updates from player
        refetchOnWindowFocus: true,
    });
}

/** Report watch progress to the server */
export function useUpdateProgress() {
    return useMutation({
        mutationFn: async (progress: UpdateProgressRequest) => {
            const { data } = await api.post<WatchProgress>('/api/library/progress', progress);
            return data;
        },
        // Don't show errors for background progress reporting
        onError: (err) => {
            console.warn('Failed to sync watch progress:', err);
        },
    });
}
