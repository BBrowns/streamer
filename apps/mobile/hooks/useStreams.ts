import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Stream } from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";

export function useStreams(type: string, id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<Stream[]>({
    queryKey: ["streams", type, id],
    queryFn: async () => {
      const { data } = await api.get(`/api/stream/${type}/${id}`);
      return data.streams;
    },
    staleTime: 2 * 60 * 1000, // 2 min cache
    gcTime: 10 * 60 * 1000, // Keep for 10 min
    retry: 1,
    refetchOnReconnect: true,
    enabled: isAuthenticated && !!type && !!id,
  });
}
