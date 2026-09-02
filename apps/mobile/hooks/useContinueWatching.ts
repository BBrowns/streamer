import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../services/api";
import type { WatchProgress, UpdateProgressRequest } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";
import { toRateLimitError } from "../services/rateLimit";

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
  const mutation = useMutation({
    mutationFn: async (progress: UpdateProgressRequest) => {
      const { data } = await api.post<WatchProgress>(
        "/api/library/progress",
        progress,
      );
      return data;
    },
    // Background progress is best-effort. The queue below keeps the latest
    // position and deliberately drops a failed write instead of retrying it
    // in a tight loop.
  });

  const pendingRef = useRef<UpdateProgressRequest | null>(null);
  const mutateAsyncRef = useRef(mutation.mutateAsync);
  mutateAsyncRef.current = mutation.mutateAsync;
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const cooldownUntilRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<(() => void) | null>(null);

  const scheduleFlush = useCallback((delayMs: number) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(
      () => {
        retryTimerRef.current = null;
        flushRef.current?.();
      },
      Math.max(0, delayMs),
    );
    retryTimerRef.current.unref?.();
  }, []);

  const flush = useCallback(() => {
    if (inFlightRef.current || !pendingRef.current) return;

    const cooldownMs = cooldownUntilRef.current - Date.now();
    if (cooldownMs > 0) {
      scheduleFlush(cooldownMs);
      return;
    }

    const next = pendingRef.current;
    pendingRef.current = null;
    const request = mutateAsyncRef
      .current(next)
      .catch((error: unknown) => {
        const rateLimitError = toRateLimitError(error);
        if (rateLimitError) {
          cooldownUntilRef.current = Date.now() + rateLimitError.retryAfterMs;
          if (pendingRef.current) scheduleFlush(rateLimitError.retryAfterMs);
          return;
        }
        if (__DEV__) console.warn("Failed to sync watch progress.");
      })
      .finally(() => {
        inFlightRef.current = null;
        if (pendingRef.current) flushRef.current?.();
      });
    inFlightRef.current = request;
  }, [scheduleFlush]);

  flushRef.current = flush;

  const mutate = useCallback(
    (progress: UpdateProgressRequest) => {
      pendingRef.current = progress;
      flush();
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      pendingRef.current = null;
    },
    [],
  );

  const mutateAsync = useCallback(
    async (progress: UpdateProgressRequest) => {
      mutate(progress);
    },
    [mutate],
  );

  return {
    ...mutation,
    mutate,
    mutateAsync,
  } as unknown as UseMutationResult<
    WatchProgress,
    unknown,
    UpdateProgressRequest
  >;
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
