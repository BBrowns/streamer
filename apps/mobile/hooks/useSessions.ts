import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "../services/api";

export interface ActiveSession {
  id: string;
  deviceId: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivity: string;
}

async function fetchSessions(): Promise<ActiveSession[]> {
  const { data } = await api.get<{ sessions: ActiveSession[] }>(
    "/api/auth/sessions",
  );
  return data.sessions;
}

export function useSessions() {
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) =>
      api.delete(`/api/auth/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to revoke session.");
    },
  });

  const revokeSession = (sessionId: string) => {
    Alert.alert(
      "Revoke Session",
      "This will sign out the device associated with this session.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => revokeMutation.mutate(sessionId),
        },
      ],
    );
  };

  return {
    sessions,
    isLoading,
    revokeSession,
    isRevoking: revokeMutation.isPending,
  };
}
