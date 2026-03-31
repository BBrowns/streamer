import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../services/api";
import type { InstalledAddon } from "@streamer/shared";
import { AxiosError } from "axios";
import { hapticImpactLight, hapticWarning } from "../../lib/haptics";

export default function AddonsScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const [addonUrl, setAddonUrl] = useState("");

  const { data: addons, isLoading } = useQuery<InstalledAddon[]>({
    queryKey: ["addons"],
    queryFn: async () => {
      const { data } = await api.get("/api/addons");
      return data.addons;
    },
    enabled: isAuthenticated,
  });

  const installMutation = useMutation({
    mutationFn: async (url: string) => {
      const { data } = await api.post("/api/addons", { transportUrl: url });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addons"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      setAddonUrl("");
      Alert.alert(
        "Success",
        "Add-on installed! New content will appear on Discover.",
      );
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to install add-on";
      Alert.alert("Installation Failed", msg || "Failed to install add-on");
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/addons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addons"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  return (
    <View style={styles.container}>
      {/* Install Input */}
      <View style={styles.installSection}>
        <Text style={styles.sectionTitle}>Install Add-on</Text>
        <Text style={styles.hint}>
          Paste a manifest.json URL to add a content source.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="https://addon-url.com/manifest.json"
            placeholderTextColor="#6b7280"
            value={addonUrl}
            onChangeText={setAddonUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={[
              styles.installBtn,
              (!addonUrl || installMutation.isPending) && styles.disabledBtn,
            ]}
            onPress={() => {
              hapticImpactLight();
              addonUrl && installMutation.mutate(addonUrl);
            }}
            disabled={!addonUrl || installMutation.isPending}
          >
            {installMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.installBtnText}>Install</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Installed Add-ons */}
      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>
          Installed ({addons?.length ?? 0})
        </Text>

        {isLoading ? (
          <ActivityIndicator color="#818cf8" style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={addons}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.addonCard}>
                <View style={styles.addonIcon}>
                  <Text style={styles.addonIconText}>
                    {item.manifest.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.addonInfo}>
                  <Text style={styles.addonName}>{item.manifest.name}</Text>
                  <Text style={styles.addonDesc} numberOfLines={1}>
                    {item.manifest.description}
                  </Text>
                  <Text style={styles.addonMeta}>
                    v{item.manifest.version} · {item.manifest.types.join(", ")}{" "}
                    · {item.manifest.catalogs.length} catalog(s)
                  </Text>
                </View>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    hapticWarning();
                    Alert.alert(
                      "Uninstall",
                      `Remove "${item.manifest.name}"?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => uninstallMutation.mutate(item.id),
                        },
                      ],
                    );
                  }}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyText}>No add-ons installed</Text>
                <Text style={styles.emptyHint}>
                  Try: https://v3-cinemeta.strem.io/manifest.json
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  installSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(129, 140, 248, 0.1)",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#e0e0ff",
    marginBottom: 4,
  },
  hint: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#1a1a3e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#e0e0ff",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.2)",
  },
  installBtn: {
    backgroundColor: "#818cf8",
    paddingHorizontal: 20,
    borderRadius: 10,
    justifyContent: "center",
    minWidth: 80,
    alignItems: "center",
  },
  disabledBtn: {
    opacity: 0.5,
  },
  installBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  listSection: {
    flex: 1,
    padding: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a3e",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  addonIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(129, 140, 248, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  addonIconText: {
    color: "#818cf8",
    fontSize: 18,
    fontWeight: "800",
  },
  addonInfo: {
    flex: 1,
  },
  addonName: {
    color: "#e0e0ff",
    fontWeight: "700",
    fontSize: 15,
  },
  addonDesc: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  addonMeta: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 3,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtnText: {
    color: "#f87171",
    fontWeight: "700",
    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyHint: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 6,
  },
});
