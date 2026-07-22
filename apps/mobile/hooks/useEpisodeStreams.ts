import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import type { StreamDiscoveryResponse } from "./useStreams";

const PARTIAL_DISCOVERY_REFETCH_DELAY_MS = 6_000;

/**
 * Fetches streams for a specific episode of a series.
 * Uses the Stremio convention: seriesId:season:episode
 */
export function useEpisodeStreams(
  seriesId: string,
  season: number | null,
  episode: number | null,
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled =
    isAuthenticated && !!seriesId && season !== null && episode !== null;
  const partialRefreshScopeRef = useRef<string | null>(null);

  const episodeId =
    season !== null && episode !== null
      ? `${seriesId}:${season}:${episode}`
      : null;

  const query = useQuery<StreamDiscoveryResponse>({
    queryKey: ["streams", "series", seriesId, season, episode],
    queryFn: async () => {
      const { data } = await api.get(`/api/stream/series/${episodeId}`);
      return data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled,
  });

  const sourceDiscoveryStatus =
    query.data?.sourceDiscovery?.status ?? "complete";
  const partialRefreshScope = `${seriesId}:${season ?? ""}:${episode ?? ""}`;

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
