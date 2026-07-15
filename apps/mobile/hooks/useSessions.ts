import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
      Alert.alert(
        t("settings.accountModals.common.errorTitle"),
        t("settings.accountModals.sessions.revokeFailed"),
      );
    },
  });

  const revokeSession = (sessionId: string) => {
    Alert.alert(
      t("settings.accountModals.sessions.revokeTitle"),
      t("settings.accountModals.sessions.revokeDescription"),
      [
        {
          text: t("settings.accountModals.common.cancel"),
          style: "cancel",
        },
        {
          text: t("settings.accountModals.sessions.revoke"),
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
