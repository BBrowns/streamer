import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { InstalledAddon } from "@streamer/shared";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores/authStore";
import {
  addonQueryKeys,
  removeInstalledAddon,
  upsertInstalledAddon,
  useAddons,
} from "../../hooks/useAddons";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { api } from "../../services/api";
import { invalidatePlaybackPlanCache } from "../../services/playback/PlaybackPlanService";
import { hapticImpactLight, hapticWarning } from "../../lib/haptics";
import { EmptyState } from "../../components/ui/EmptyState";
import { AppButton } from "../../components/ui/AppButton";
import { AppIconButton } from "../../components/ui/AppIconButton";
import { AdaptiveRoutePage } from "../../components/ui/AdaptiveRoutePage";
import { AdaptiveOverlay } from "../../components/ui/AdaptiveOverlay";
import { InlineNotice } from "../../components/ui/InlineNotice";
import { Surface } from "../../components/ui/Surface";
import { TextField } from "../../components/ui/TextField";
import {
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../../components/ui/designSystem";

type Feedback = {
  tone: "success" | "error";
  message: string;
};

function getMutationError(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export default function AddonsScreen() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isCompact } = useWindowClass();
  const [addonUrl, setAddonUrl] = useState("");
  const [installFeedback, setInstallFeedback] = useState<Feedback | null>(null);
  const [removalError, setRemovalError] = useState<{
    addonId: string;
    message: string;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const normalizedAddonUrl = addonUrl.trim();

  const {
    data: addons,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useAddons();

  const installMutation = useMutation({
    onMutate: () => setInstallFeedback(null),
    mutationFn: async (url: string): Promise<InstalledAddon> => {
      const { data } = await api.post("/api/addons", { transportUrl: url });
      return data;
    },
    onSuccess: (addon) => {
      invalidatePlaybackPlanCache();
      queryClient.setQueryData<InstalledAddon[]>(
        addonQueryKeys.list(userId),
        (current) => upsertInstalledAddon(current, addon),
      );
      void queryClient.invalidateQueries({ queryKey: ["addons"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["streams"] });
      setAddonUrl("");
      setInstallFeedback({
        tone: "success",
        message: t(
          addon.manifest.behaviorHints?.configurationRequired
            ? "addons.install.configurationRequiredDetail"
            : "addons.install.successDetail",
        ),
      });
    },
    onError: (error: unknown) => {
      setInstallFeedback({
        tone: "error",
        message: getMutationError(error, t("addons.install.error")),
      });
    },
  });

  const uninstallMutation = useMutation({
    onMutate: (id: string) => {
      if (removalError?.addonId === id) setRemovalError(null);
    },
    mutationFn: async (id: string) => {
      await api.delete(`/api/addons/${id}`);
    },
    onSuccess: (_result, addonId) => {
      invalidatePlaybackPlanCache();
      queryClient.setQueryData<InstalledAddon[]>(
        addonQueryKeys.list(userId),
        (current) => removeInstalledAddon(current, addonId),
      );
      void queryClient.invalidateQueries({ queryKey: ["addons"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["streams"] });
      setRemovalError(null);
      setPendingRemoval(null);
    },
    onError: (error: unknown, id: string) => {
      setPendingRemoval(null);
      setRemovalError({
        addonId: id,
        message: getMutationError(
          error,
          t("addons.installed.removeError", {
            defaultValue: "This add-on could not be removed. Try again.",
          }),
        ),
      });
    },
  });

  const installAddon = () => {
    if (!normalizedAddonUrl || installMutation.isPending) return;
    hapticImpactLight();
    installMutation.mutate(normalizedAddonUrl);
  };

  const confirmRemoval = () => {
    if (!pendingRemoval || uninstallMutation.isPending) return;
    uninstallMutation.mutate(pendingRemoval.id);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("addons.title"),
          headerShown: isCompact,
          headerBackTitle: t("navigation.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <AdaptiveRoutePage
        title={t("addons.title")}
        eyebrow="Streamer"
        description={t("addons.install.hint")}
        boundary="reading"
        testID="addons-screen"
        boundaryStyle={styles.content}
      >
        <Surface style={styles.installSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("addons.install.title")}
          </Text>
          <View style={[styles.inputRow, isCompact && styles.inputRowCompact]}>
            <TextField
              label={t("addons.install.urlLabel", {
                defaultValue: "Manifest URL",
              })}
              containerStyle={styles.inputField}
              placeholder={t("addons.install.placeholder")}
              value={addonUrl}
              onChangeText={setAddonUrl}
              onSubmitEditing={installAddon}
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
              onPress={installAddon}
              style={[
                styles.installButton,
                isCompact && styles.installButtonCompact,
              ]}
            />
          </View>
          {!!installFeedback && (
            <InlineNotice
              tone={installFeedback.tone}
              message={installFeedback.message}
            />
          )}
        </Surface>

        <View style={styles.listSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("addons.installed.title", { count: addons?.length ?? 0 })}
          </Text>

          {isLoading || isRefetching ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.textSecondary} />
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
                  <View style={styles.addonItem}>
                    <View style={styles.addonCard}>
                      <View
                        style={[
                          styles.addonIcon,
                          { backgroundColor: colors.surfaceSubtle },
                        ]}
                      >
                        <Text
                          style={[
                            styles.addonIconText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.manifest.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.addonInfo}>
                        <Text
                          style={[styles.addonName, { color: colors.text }]}
                        >
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
                        {item.manifest.behaviorHints?.configurationRequired ? (
                          <Text
                            style={[
                              styles.addonSetupHint,
                              { color: colors.warning },
                            ]}
                          >
                            {t("addons.installed.configurationRequired")}
                          </Text>
                        ) : null}
                      </View>
                      <AppIconButton
                        icon="trash-outline"
                        accessibilityLabel={t(
                          "addons.installed.confirmRemove",
                          { name: item.manifest.name },
                        )}
                        disabled={isRemoving}
                        loading={isRemoving}
                        variant="danger"
                        style={styles.removeButton}
                        onPress={() => {
                          hapticWarning();
                          setPendingRemoval({
                            id: item.id,
                            name: item.manifest.name,
                          });
                        }}
                      />
                    </View>
                    {removalError?.addonId === item.id && (
                      <InlineNotice
                        tone="error"
                        message={removalError.message}
                        actionLabel={t("common.retry")}
                        onAction={() => uninstallMutation.mutate(item.id)}
                      />
                    )}
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
      </AdaptiveRoutePage>
      <AdaptiveOverlay
        visible={pendingRemoval !== null}
        onClose={() => {
          if (!uninstallMutation.isPending) setPendingRemoval(null);
        }}
        accessibilityLabel={t("addons.installed.uninstall")}
        testID="addon-remove-overlay"
        size="menu"
        placement="center"
      >
        <View style={styles.removeDialog}>
          <Text style={[styles.removeTitle, { color: colors.text }]}>
            {t("addons.installed.uninstall")}
          </Text>
          <Text style={[styles.removeMessage, { color: colors.textSecondary }]}>
            {pendingRemoval
              ? t("addons.installed.confirmRemove", {
                  name: pendingRemoval.name,
                })
              : null}
          </Text>
          <View style={styles.removeActions}>
            <AppButton
              label={t("addons.installed.cancel")}
              variant="ghost"
              onPress={() => setPendingRemoval(null)}
              disabled={uninstallMutation.isPending}
              testID="addon-remove-cancel"
            />
            <AppButton
              label={t("addons.installed.remove")}
              variant="danger"
              loading={uninstallMutation.isPending}
              onPress={confirmRemoval}
              testID="addon-remove-confirm"
            />
          </View>
        </View>
      </AdaptiveOverlay>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: uiSpacing.xxl,
  },
  installSection: {
    gap: uiSpacing.lg,
  },
  sectionTitle: {
    ...uiTypography.utilitySectionTitle,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: uiSpacing.md,
  },
  inputRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  inputField: {
    flex: 1,
    width: "100%",
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
  addonItem: {
    gap: uiSpacing.sm,
  },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    gap: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
  },
  addonIcon: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: 8,
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
  addonSetupHint: {
    ...uiTypography.caption,
    marginTop: uiSpacing.xs,
  },
  removeDialog: {
    padding: uiSpacing.xl,
    gap: uiSpacing.md,
  },
  removeTitle: {
    ...uiTypography.utilitySectionTitle,
  },
  removeMessage: {
    ...uiTypography.body,
  },
  removeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: uiSpacing.sm,
    marginTop: uiSpacing.sm,
  },
  removeButton: {
    alignSelf: "center",
  },
});
