import { useMutation } from "@tanstack/react-query";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

// To resolve lint error about cacheDirectory not being found on the namespace
const cacheDirectory = (FileSystem as any).cacheDirectory;

export function useAccount() {
  const logout = useAuthStore((s) => s.logout);

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await api.delete("/api/auth/account");
    },
    onSuccess: () => {
      logout();
      Alert.alert(
        "Account Deleted",
        "Your account and all data have been permanently removed.",
      );
    },
    onError: (err: any) => {
      Alert.alert(
        "Deletion Failed",
        err.response?.data?.message || err.message,
      );
    },
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const { data } = await api.get("/api/auth/export");

      const fileUri = `${cacheDirectory}streamer_data_export.json`;
      await FileSystem.writeAsStringAsync(
        fileUri,
        JSON.stringify(data, null, 2),
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Export My Data",
          UTI: "public.json",
        });
      } else {
        Alert.alert(
          "Export Ready",
          "Your data has been prepared but sharing is not available on this device.",
        );
      }
    },
    onError: (err: any) => {
      Alert.alert("Export Failed", err.response?.data?.message || err.message);
    },
  });

  return {
    deleteAccount,
    exportData,
  };
}
