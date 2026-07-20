import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { DeviceEventEmitter } from "react-native";

export interface PlaybackSession {
  deviceId: string;
  deviceName?: string;
  itemId?: string;
  itemTitle?: string;
  status: "playing" | "paused" | "idle";
  position?: number;
  duration?: number;
  lastUpdate: number;
}

export const playbackSessionsQueryKey = ["playback-sessions"] as const;
const emptyPlaybackSessions: PlaybackSession[] = [];

function isRemoteControlReady({
  isHydrated,
  isAuthenticated,
  accessToken,
}: {
  isHydrated: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
}) {
  return isHydrated && isAuthenticated && Boolean(accessToken);
}

export function useRemoteControl() {
  const queryClient = useQueryClient();
  const deviceId = useAuthStore((state) => state.deviceId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [activeSessions, setActiveSessions] = useState<PlaybackSession[]>([]);
  const canUseRemoteControl = isRemoteControlReady({
    isHydrated,
    isAuthenticated,
    accessToken,
  });

  // Session data is user-specific. Waiting for both persisted auth state and the
  // secure token prevents the always-mounted remote-control bar from issuing an
  // anonymous request during app boot (or after logout).
  const { data: sessions = emptyPlaybackSessions } = useQuery({
    queryKey: playbackSessionsQueryKey,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ sessions: PlaybackSession[] }>(
        "/api/sessions",
        { signal },
      );
      return data.sessions;
    },
    enabled: canUseRemoteControl,
    // Real-time sync is the primary delivery mechanism and the next polling
    // interval is already a safe fallback. Retrying a 401 here only creates
    // noisy anonymous/auth-expiry request loops.
    retry: false,
    refetchInterval: canUseRemoteControl ? 30_000 : false,
  });

  // Listen for real-time session updates via Global Event (emitted by useSync)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("SESSION_UPDATE", (data) => {
      if (!canUseRemoteControl) return;
      if (data.sessions) {
        setActiveSessions(data.sessions);
        queryClient.setQueryData(playbackSessionsQueryKey, data.sessions);
      }
    });

    return () => sub.remove();
  }, [canUseRemoteControl, queryClient]);

  // Do not leave another user's remote session visible after a logout or a
  // partially hydrated app boot. Cancelling also aborts an in-flight poll.
  useEffect(() => {
    if (!canUseRemoteControl) {
      setActiveSessions([]);
      void queryClient.cancelQueries({ queryKey: playbackSessionsQueryKey });
      queryClient.removeQueries({ queryKey: playbackSessionsQueryKey });
      return;
    }

    setActiveSessions(sessions);
  }, [canUseRemoteControl, queryClient, sessions]);

  // Mutation to update local session status
  const updateStatus = useMutation({
    mutationFn: async (status: Partial<PlaybackSession>) => {
      if (!isRemoteControlReady(useAuthStore.getState())) return;
      await api.post("/api/sessions/update", status);
    },
  });

  // Mutation to send a remote command
  const sendCommand = useMutation({
    mutationFn: async ({
      targetDeviceId,
      action,
      data,
    }: {
      targetDeviceId: string;
      action: string;
      data?: any;
    }) => {
      if (!isRemoteControlReady(useAuthStore.getState())) return;
      await api.post("/api/sessions/command", { targetDeviceId, action, data });
    },
  });

  // Helper to check if other devices are active
  const otherActiveSessions = activeSessions.filter(
    (s) => s.deviceId !== deviceId && s.status !== "idle",
  );

  return {
    sessions: activeSessions,
    otherActiveSessions,
    updateStatus: updateStatus.mutate,
    sendCommand: sendCommand.mutate,
    isUpdating: updateStatus.isPending,
    isSending: sendCommand.isPending,
  };
}
