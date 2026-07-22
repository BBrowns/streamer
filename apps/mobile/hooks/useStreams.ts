import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../services/api";
import type { Stream } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export type StreamDiscoveryResponse = {
  streams: Stream[];
  sourceDiscovery?: {
    status: "partial" | "complete";
  };
};

// Default add-on timeouts are five seconds. Give the server's background
// discovery enough time to warm its complete result, then refetch once.
const PARTIAL_DISCOVERY_REFETCH_DELAY_MS = 6_000;

export function useStreams(type: string, id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const partialRefreshScopeRef = useRef<string | null>(null);

  const query = useQuery<StreamDiscoveryResponse>({
    queryKey: ["streams", type, id],
    queryFn: async () => {
      const { data } = await api.get(`/api/stream/${type}/${id}`);
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 min cache
    gcTime: 10 * 60 * 1000, // Keep for 10 min
    retry: 1,
    refetchOnReconnect: true,
    enabled: isAuthenticated && !!type && !!id,
  });

  const sourceDiscoveryStatus =
    query.data?.sourceDiscovery?.status ?? "complete";
  const partialRefreshScope = `${type}:${id}`;

  // The server returns a useful first batch quickly, then completes the same
  // discovery run in its short-lived cache. React Query must not hold that
  // partial card list for two minutes, so give it one bounded follow-up fetch.
  useEffect(() => {
    if (
      sourceDiscoveryStatus !== "partial" ||
      partialRefreshScopeRef.current === partialRefreshScope
    ) {
      return;
    }

    partialRefreshScopeRef.current = partialRefreshScope;
    const timeout = setTimeout(() => {
      void query.refetch();
    }, PARTIAL_DISCOVERY_REFETCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [partialRefreshScope, query.refetch, sourceDiscoveryStatus]);

  return {
    ...query,
    data: query.data?.streams,
    sourceDiscoveryStatus,
  };
}
