import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import type { WatchProgress, UpdateProgressRequest } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

/** Query key factory */
export const progressKeys = {
  all: ["progress"] as const,
  continueWatching: () => [...progressKeys.all, "continue"] as const,
};

/** Fetch the continue-watching list (items < 95% completed) */
export function useContinueWatching() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: progressKeys.continueWatching(),
    queryFn: async () => {
      const { data } = await api.get<{ items: WatchProgress[] }>(
        "/api/library/progress",
      );
      return data.items;
    },
    enabled: isAuthenticated,
    // Refetch when screen is focused to catch progress updates from player
    refetchOnWindowFocus: true,
  });
}

/** Report watch progress to the server */
export function useUpdateProgress() {
  return useMutation({
    mutationFn: async (progress: UpdateProgressRequest) => {
      const { data } = await api.post<WatchProgress>(
        "/api/library/progress",
        progress,
      );
      return data;
    },
    // Don't show errors for background progress reporting
    onError: (err: unknown) => {
      console.warn("Failed to sync watch progress:", err);
    },
  });
}

/** Remove one title from Continue Watching. */
export function useRemoveProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete("/api/library/progress", { data: { itemId } });
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({
        queryKey: progressKeys.continueWatching(),
      });

      const previousItems = queryClient.getQueryData<WatchProgress[]>(
        progressKeys.continueWatching(),
      );

      queryClient.setQueryData<WatchProgress[]>(
        progressKeys.continueWatching(),
        (old) => old?.filter((item) => item.itemId !== itemId) ?? [],
      );

      return { previousItems };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(
          progressKeys.continueWatching(),
          context.previousItems,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: progressKeys.all });
    },
  });
}
