import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Stream } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

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
    isAuthenticated &&
    !!seriesId &&
    season !== null &&
    episode !== null;

  const episodeId =
    season !== null && episode !== null
      ? `${seriesId}:${season}:${episode}`
      : null;

  return useQuery<Stream[]>({
    queryKey: ["streams", "series", seriesId, season, episode],
    queryFn: async () => {
      const { data } = await api.get(`/api/stream/series/${episodeId}`);
      return data.streams;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled,
  });
}
