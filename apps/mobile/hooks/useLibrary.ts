import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { LibraryItem, AddToLibraryRequest } from '@streamer/shared';

/** Query key factory */
const libraryKeys = {
    all: ['library'] as const,
    list: () => [...libraryKeys.all, 'list'] as const,
    check: (itemId: string) => [...libraryKeys.all, 'check', itemId] as const,
};

/** Fetch the user's full library */
export function useLibrary() {
    return useQuery({
        queryKey: libraryKeys.list(),
        queryFn: async () => {
            const { data } = await api.get<{ items: LibraryItem[] }>('/api/library');
            return data.items;
        },
    });
}

/** Check if a specific item is in the library */
export function useIsInLibrary(itemId: string) {
    return useQuery({
        queryKey: libraryKeys.check(itemId),
        queryFn: async () => {
            const { data } = await api.get<{ inLibrary: boolean }>(`/api/library/check/${itemId}`);
            return data.inLibrary;
        },
        enabled: !!itemId,
    });
}

/** Add item to library — with optimistic update */
export function useAddToLibrary() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (item: AddToLibraryRequest) => {
            const { data } = await api.post<LibraryItem>('/api/library', item);
            return data;
        },

        // Optimistic update: instantly add to the list
        onMutate: async (newItem) => {
            await queryClient.cancelQueries({ queryKey: libraryKeys.list() });

            const previousItems = queryClient.getQueryData<LibraryItem[]>(libraryKeys.list());

            const optimisticItem: LibraryItem = {
                id: `optimistic-${Date.now()}`,
                userId: '',
                type: newItem.type,
                itemId: newItem.itemId,
                title: newItem.title,
                poster: newItem.poster ?? null,
                addedAt: new Date().toISOString(),
            };

            queryClient.setQueryData<LibraryItem[]>(libraryKeys.list(), (old) =>
                old ? [optimisticItem, ...old] : [optimisticItem],
            );

            // Also optimistically set the "check" cache
            queryClient.setQueryData(libraryKeys.check(newItem.itemId), true);

            return { previousItems };
        },

        onError: (_err, newItem, context) => {
            // Rollback on error
            if (context?.previousItems) {
                queryClient.setQueryData(libraryKeys.list(), context.previousItems);
            }
            queryClient.setQueryData(libraryKeys.check(newItem.itemId), false);
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: libraryKeys.all });
        },
    });
}

/** Remove item from library — with optimistic update */
export function useRemoveFromLibrary() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (itemId: string) => {
            await api.delete('/api/library', { data: { itemId } });
        },

        onMutate: async (itemId) => {
            await queryClient.cancelQueries({ queryKey: libraryKeys.list() });

            const previousItems = queryClient.getQueryData<LibraryItem[]>(libraryKeys.list());

            queryClient.setQueryData<LibraryItem[]>(libraryKeys.list(), (old) =>
                old ? old.filter((i) => i.itemId !== itemId) : [],
            );

            queryClient.setQueryData(libraryKeys.check(itemId), false);

            return { previousItems, itemId };
        },

        onError: (_err, _itemId, context) => {
            if (context?.previousItems) {
                queryClient.setQueryData(libraryKeys.list(), context.previousItems);
            }
            if (context?.itemId) {
                queryClient.setQueryData(libraryKeys.check(context.itemId), true);
            }
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: libraryKeys.all });
        },
    });
}
