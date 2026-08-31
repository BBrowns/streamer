import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Linking } from "react-native";
import { useAuthStore } from "../stores/authStore";
import {
  disconnectRealDebrid,
  getRealDebridStatus,
  pollRealDebridDeviceFlow,
  startRealDebridDeviceFlow,
} from "../services/realDebridService";

const QUERY_KEY = ["integrations", "real-debrid"];

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function useRealDebrid() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getRealDebridStatus,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const flow = await startRealDebridDeviceFlow();
      await Linking.openURL(flow.verificationUrl).catch(() => undefined);
      Alert.alert(
        "Connect Real-Debrid",
        `Enter code ${flow.userCode} on the Real-Debrid verification page.`,
      );

      const deadline = Date.parse(flow.expiresAt);
      let retryAfterSeconds = flow.intervalSeconds;
      while (Date.now() < deadline) {
        await wait(retryAfterSeconds * 1000);
        const result = await pollRealDebridDeviceFlow(flow.flowId);
        if (result.status === "connected") return result;
        if (result.status === "expired") break;
        retryAfterSeconds = result.retryAfterSeconds;
      }
      throw new Error("Real-Debrid device authorization expired.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      Alert.alert("Real-Debrid connected", "Your account is now connected.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectRealDebrid,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    status: status.data,
    isLoading:
      status.isLoading ||
      connectMutation.isPending ||
      disconnectMutation.isPending,
    isError: status.isError,
    connect: () => connectMutation.mutateAsync(),
    disconnect: () => disconnectMutation.mutateAsync(),
  };
}
