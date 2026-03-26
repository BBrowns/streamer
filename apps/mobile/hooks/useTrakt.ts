import { useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "../services/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

// You should get these from a config or env
const TRAKT_CLIENT_ID =
  process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID || "YOUR_CLIENT_ID";

export function useTrakt() {
  const queryClient = useQueryClient();
  const REDIRECT_URI = Linking.createURL("trakt-callback");

  const { data: status, isLoading: isStatusLoading } = useQuery({
    queryKey: ["trakt-status"],
    queryFn: async () => {
      const { data } = await api.get("/api/trakt/status");
      return data as { connected: boolean };
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (code: string) => {
      await api.post("/api/trakt/connect", { code, redirectUri: REDIRECT_URI });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trakt-status"] });
      Alert.alert("Success", "Trakt.tv account connected!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to connect Trakt.tv account.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await api.delete("/api/trakt/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trakt-status"] });
      Alert.alert("Disconnected", "Trakt.tv account unlinked.");
    },
  });

  const connect = useCallback(async () => {
    const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;

    try {
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        REDIRECT_URI,
      );

      if (result.type === "success") {
        const { url } = result;
        const params = Linking.parse(url);
        const code = params.queryParams?.code;

        if (typeof code === "string") {
          await connectMutation.mutateAsync(code);
        }
      }
    } catch (err) {
      console.error("OAuth failed", err);
      Alert.alert("Error", "Failed to open Trakt.tv login.");
    }
  }, [connectMutation, REDIRECT_URI]);

  return {
    connected: !!status?.connected,
    isLoading:
      isStatusLoading ||
      connectMutation.isPending ||
      disconnectMutation.isPending,
    connect,
    disconnect: disconnectMutation.mutate,
  };
}
