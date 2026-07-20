import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { WatchHistoryPage, WatchProgress } from "@streamer/shared";
import { api } from "../services/api";
import { progressKeys } from "./useContinueWatching";
import { useAuthStore } from "../stores/authStore";

const HISTORY_PAGE_SIZE = 24;

export const watchHistoryKeys = {
  all: () => [...progressKeys.all, "history"] as const,
  list: () => [...watchHistoryKeys.all(), HISTORY_PAGE_SIZE] as const,
};

async function fetchWatchHistory(
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<WatchHistoryPage> {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  const { data } = await api.get<WatchHistoryPage>(
    `/api/library/history?${params.toString()}`,
    { signal },
  );
  return {
    items: data.items ?? [],
    nextCursor: data.nextCursor,
  };
}

/**
 * Cursor-paginated personal watch history. This intentionally includes
 * completed titles, unlike Continue Watching.
 */
export function useWatchHistory() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const result = useInfiniteQuery({
    queryKey: watchHistoryKeys.list(),
    queryFn: ({ signal, pageParam }) =>
      fetchWatchHistory(pageParam || undefined, signal),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    retry: 1,
  });

  return {
    ...result,
    items: result.data?.pages.flatMap((page) => page.items) ?? [],
    pageCount: result.data?.pages.length ?? 0,
  };
}

function updateHistoryCache(
  queryClient: ReturnType<typeof useQueryClient>,
  transform: (items: WatchProgress[]) => WatchProgress[],
) {
  queryClient.setQueriesData<InfiniteData<WatchHistoryPage>>(
    { queryKey: watchHistoryKeys.all() },
    (cached) =>
      cached
        ? {
            ...cached,
            pages: cached.pages.map((page) => ({
              ...page,
              items: transform(page.items),
            })),
          }
        : cached,
  );
}

/** Remove precisely one movie or episode entry from personal history. */
export function useRemoveWatchHistoryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (historyId: string) => {
      await api.delete(`/api/library/history/${historyId}`);
    },
    onMutate: async (historyId) => {
      await queryClient.cancelQueries({ queryKey: watchHistoryKeys.all() });
      const previous = queryClient.getQueriesData<
        InfiniteData<WatchHistoryPage>
      >({ queryKey: watchHistoryKeys.all() });
      updateHistoryCache(queryClient, (items) =>
        items.filter((item) => item.id !== historyId),
      );
      return { previous };
    },
    onError: (_error, _historyId, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: progressKeys.all });
    },
  });
}

/** Clear all personal watch history after the UI has obtained confirmation. */
export function useClearWatchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete("/api/library/history");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: watchHistoryKeys.all() });
      const previous = queryClient.getQueriesData<
        InfiniteData<WatchHistoryPage>
      >({ queryKey: watchHistoryKeys.all() });
      updateHistoryCache(queryClient, () => []);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: progressKeys.all });
    },
  });
}
