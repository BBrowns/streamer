import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { useSearch } from "../../hooks/useSearch";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { EmptyState } from "../../components/ui/EmptyState";
import { api } from "../../services/api";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import type { InstalledAddon } from "@streamer/shared";
import { AxiosError } from "axios";
import { hapticImpactLight, hapticWarning } from "../../lib/haptics";

export default function AddonsScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
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
        t("addons.install.success"),
        t("addons.install.successDetail"),
      );
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof AxiosError
          ? err.response?.data?.error
          : t("addons.install.error");
      Alert.alert(t("addons.install.error"), msg || t("addons.install.error"));
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Install Input */}
      <View
        style={[styles.installSection, { borderBottomColor: colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("addons.install.title")}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t("addons.install.hint")}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder={t("addons.install.placeholder")}
            placeholderTextColor={colors.textSecondary + "80"}
            value={addonUrl}
            onChangeText={setAddonUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={[
              styles.installBtn,
              { backgroundColor: colors.tint },
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
              <Text style={[styles.installBtnText, { color: "#fff" }]}>
                {t("addons.install.button")}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Installed Add-ons */}
      <View style={[styles.listSection, isDesktop && styles.desktopContent]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("addons.installed.title", { count: addons?.length ?? 0 })}
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.tint} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={addons}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={({ hovered }) => [
                  styles.addonCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                  hovered && {
                    borderColor: colors.tint,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    transform: [{ scale: 1.005 }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.addonIcon,
                    {
                      backgroundColor: isDark
                        ? "rgba(99, 102, 241, 0.2)"
                        : colors.tint + "15",
                    },
                  ]}
                >
                  <Text style={[styles.addonIconText, { color: colors.tint }]}>
                    {item.manifest.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.addonInfo}>
                  <Text style={[styles.addonName, { color: colors.text }]}>
                    {item.manifest.name}
                  </Text>
                  <Text
                    style={[styles.addonDesc, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.manifest.description}
                  </Text>
                  <Text
                    style={[
                      styles.addonMeta,
                      { color: colors.textSecondary + "90" },
                    ]}
                  >
                    v{item.manifest.version} · {item.manifest.types.join(", ")}{" "}
                    · {item.manifest.catalogs.length} catalog(s)
                  </Text>
                </View>
                <Pressable
                  style={({ hovered }) => [
                    styles.removeBtn,
                    { backgroundColor: "rgba(239, 68, 68, 0.1)" },
                    hovered && {
                      backgroundColor: "rgba(239, 68, 68, 0.2)",
                      transform: [{ scale: 1.1 }],
                    },
                  ]}
                  onPress={() => {
                    hapticWarning();
                    Alert.alert(
                      t("addons.installed.uninstall"),
                      t("addons.installed.confirmRemove", {
                        name: item.manifest.name,
                      }),
                      [
                        { text: t("addons.installed.cancel"), style: "cancel" },
                        {
                          text: t("addons.installed.remove"),
                          style: "destructive",
                          onPress: () => uninstallMutation.mutate(item.id),
                        },
                      ],
                    );
                  }}
                >
                  <Text style={[styles.removeBtnText, { color: "#ef4444" }]}>
                    ✕
                  </Text>
                </Pressable>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  {t("addons.empty.title")}
                </Text>
                <Text
                  style={[
                    styles.emptyHint,
                    { color: colors.textSecondary + "80" },
                  ]}
                >
                  {t("addons.empty.hint")}
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
  },
  desktopContent: {
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
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
