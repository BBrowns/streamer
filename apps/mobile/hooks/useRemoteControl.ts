import { useEffect, useState, useCallback } from "react";
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

export function useRemoteControl() {
  const queryClient = useQueryClient();
  const { deviceId } = useAuthStore();
  const [activeSessions, setActiveSessions] = useState<PlaybackSession[]>([]);

  // Fetch active sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["playback-sessions"],
    queryFn: async () => {
      const { data } = await api.get<{ sessions: PlaybackSession[] }>(
        "/api/sessions",
      );
      return data.sessions;
    },
    refetchInterval: 30000, // Poll every 30s as fallback
  });

  // Listen for real-time session updates via Global Event (emitted by useSync)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("SESSION_UPDATE", (data) => {
      if (data.sessions) {
        setActiveSessions(data.sessions);
        queryClient.setQueryData(["playback-sessions"], data.sessions);
      }
    });

    return () => sub.remove();
  }, [queryClient]);

  // Update effect for local state vs polled state
  useEffect(() => {
    if (sessions.length > 0) {
      setActiveSessions(sessions);
    }
  }, [sessions]);

  // Mutation to update local session status
  const updateStatus = useMutation({
    mutationFn: async (status: Partial<PlaybackSession>) => {
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
