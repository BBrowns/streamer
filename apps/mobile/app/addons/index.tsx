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
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { EmptyState } from "../../components/ui/EmptyState";
import { AppButton } from "../../components/ui/AppButton";
import { ContentBoundary } from "../../components/ui/ContentBoundary";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  getWebFocusStyle,
  uiLayout,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../../components/ui/designSystem";
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
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 600;
  const [addonUrl, setAddonUrl] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const normalizedAddonUrl = addonUrl.trim();

  const {
    data: addons,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery<InstalledAddon[]>({
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
      <ContentBoundary
        maxWidth={uiLayout.readingMaxWidth}
        style={styles.content}
      >
        <PageHeader title={t("addons.title")} style={styles.pageHeader} />

        <View
          style={[styles.installSection, { borderBottomColor: colors.border }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("addons.install.title")}
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t("addons.install.hint")}
          </Text>
          <View style={[styles.inputRow, isCompact && styles.inputRowCompact]}>
            <TextInput
              accessibilityLabel={t("addons.install.title")}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: inputFocused ? colors.tint : "transparent",
                  color: colors.text,
                },
                Platform.OS === "web" &&
                  inputFocused &&
                  getWebFocusStyle(colors.focus),
                isCompact && styles.inputCompact,
              ]}
              placeholder={t("addons.install.placeholder")}
              placeholderTextColor={colors.textSecondary + "80"}
              value={addonUrl}
              onChangeText={setAddonUrl}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onSubmitEditing={() => {
                if (!normalizedAddonUrl || installMutation.isPending) return;
                hapticImpactLight();
                installMutation.mutate(normalizedAddonUrl);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
            />
            <AppButton
              label={t("addons.install.button")}
              icon="add-outline"
              variant="primary"
              loading={installMutation.isPending}
              disabled={!normalizedAddonUrl}
              onPress={() => {
                hapticImpactLight();
                installMutation.mutate(normalizedAddonUrl);
              }}
              style={[
                styles.installButton,
                isCompact && styles.installButtonCompact,
              ]}
            />
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("addons.installed.title", { count: addons?.length ?? 0 })}
          </Text>

          {isLoading || isRefetching ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : isError ? (
            <EmptyState
              testID="addons-error-state"
              icon="cloud-offline-outline"
              title={t("addons.fetchError.title", {
                defaultValue: "Add-ons could not load",
              })}
              description={t("addons.fetchError.description", {
                defaultValue: "Check your connection and try again.",
              })}
              actionLabel={t("common.retry")}
              onAction={() => refetch()}
              size="small"
              fill={false}
            />
          ) : (
            <FlatList
              data={addons}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isRemoving =
                  uninstallMutation.isPending &&
                  uninstallMutation.variables === item.id;
                const localizedTypes = item.manifest.types.map((type) => {
                  if (type === "movie") return t("search.types.movie");
                  if (type === "series") return t("search.types.series");
                  return type;
                });

                return (
                  <View
                    style={[styles.addonCard, { backgroundColor: colors.card }]}
                  >
                    <View
                      style={[
                        styles.addonIcon,
                        { backgroundColor: colors.tint + "12" },
                      ]}
                    >
                      <Text
                        style={[styles.addonIconText, { color: colors.tint }]}
                      >
                        {item.manifest.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.addonInfo}>
                      <Text style={[styles.addonName, { color: colors.text }]}>
                        {item.manifest.name}
                      </Text>
                      <Text
                        style={[
                          styles.addonDesc,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {item.manifest.description}
                      </Text>
                      <Text
                        style={[
                          styles.addonMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        v{item.manifest.version}
                        {localizedTypes.length > 0
                          ? ` · ${localizedTypes.join(" · ")}`
                          : ""}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("addons.installed.confirmRemove", {
                        name: item.manifest.name,
                      })}
                      accessibilityState={{
                        disabled: isRemoving,
                        busy: isRemoving,
                      }}
                      disabled={isRemoving}
                      style={({ hovered, pressed, focused }: any) => [
                        styles.removeButton,
                        {
                          backgroundColor:
                            colors.error + (hovered ? "20" : "12"),
                          opacity: pressed ? 0.72 : isRemoving ? 0.48 : 1,
                        },
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(colors.focus),
                      ]}
                      onPress={() => {
                        hapticWarning();
                        Alert.alert(
                          t("addons.installed.uninstall"),
                          t("addons.installed.confirmRemove", {
                            name: item.manifest.name,
                          }),
                          [
                            {
                              text: t("addons.installed.cancel"),
                              style: "cancel",
                            },
                            {
                              text: t("addons.installed.remove"),
                              style: "destructive",
                              onPress: () => uninstallMutation.mutate(item.id),
                            },
                          ],
                        );
                      }}
                    >
                      {isRemoving ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Ionicons
                          name="trash-outline"
                          size={19}
                          color={colors.error}
                        />
                      )}
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                <EmptyState
                  icon="extension-puzzle-outline"
                  title={t("addons.empty.title")}
                  description={t("addons.empty.hint")}
                  size="small"
                  fill={false}
                />
              }
            />
          )}
        </View>
      </ContentBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: uiSpacing.xxl,
  },
  pageHeader: {
    marginBottom: uiSpacing.xxxl,
  },
  installSection: {
    paddingBottom: uiSpacing.xxxl,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    ...uiTypography.title,
  },
  hint: {
    ...uiTypography.body,
    marginTop: uiSpacing.sm,
    marginBottom: uiSpacing.lg,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  inputRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  input: {
    flex: 1,
    width: "100%",
    minHeight: 48,
    borderRadius: uiRadii.control,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
    borderWidth: 1,
    ...uiTypography.body,
  },
  inputCompact: {
    flex: 0,
  },
  installButton: {
    minWidth: 112,
  },
  installButtonCompact: {
    width: "100%",
  },
  listSection: {
    flex: 1,
    paddingTop: uiSpacing.xxxl,
  },
  listContent: {
    paddingTop: uiSpacing.md,
    paddingBottom: uiSpacing.section,
    gap: uiSpacing.md,
  },
  loadingState: {
    paddingVertical: uiSpacing.huge,
    alignItems: "center",
  },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    borderRadius: uiRadii.card,
    padding: uiSpacing.lg,
    gap: uiSpacing.md,
  },
  addonIcon: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
    justifyContent: "center",
    alignItems: "center",
  },
  addonIconText: {
    ...uiTypography.title,
    fontSize: 18,
    lineHeight: 22,
  },
  addonInfo: {
    flex: 1,
    minWidth: 0,
  },
  addonName: {
    ...uiTypography.label,
    fontSize: 15,
    lineHeight: 20,
  },
  addonDesc: {
    ...uiTypography.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: uiSpacing.xs,
  },
  addonMeta: {
    ...uiTypography.caption,
    marginTop: uiSpacing.xs,
  },
  removeButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
    justifyContent: "center",
    alignItems: "center",
  },
});
