import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { InstalledAddon } from "@streamer/shared";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { api } from "../../services/api";
import { hapticImpactLight, hapticWarning } from "../../lib/haptics";
import { EmptyState } from "../../components/ui/EmptyState";
import { AppButton } from "../../components/ui/AppButton";
import { ContentBoundary } from "../../components/ui/ContentBoundary";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageLayout } from "../../components/ui/PageLayout";
import { Surface } from "../../components/ui/Surface";
import { TextField } from "../../components/ui/TextField";
import {
  getWebFocusStyle,
  uiLayout,
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 600;
  const [addonUrl, setAddonUrl] = useState("");
  const [installFeedback, setInstallFeedback] = useState<Feedback | null>(null);
  const [removalError, setRemovalError] = useState<{
    addonId: string;
    message: string;
  } | null>(null);
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
    onMutate: () => setInstallFeedback(null),
    mutationFn: async (url: string) => {
      const { data } = await api.post("/api/addons", { transportUrl: url });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["addons"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      setAddonUrl("");
      setInstallFeedback({
        tone: "success",
        message: t("addons.install.successDetail"),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["addons"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      setRemovalError(null);
    },
    onError: (error: unknown, id: string) => {
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

  return (
    <PageLayout contained={false} testID="addons-screen">
      <ContentBoundary
        maxWidth={uiLayout.readingMaxWidth}
        style={styles.content}
      >
        <PageHeader
          eyebrow="Streamer"
          title={t("addons.title")}
          description={t("addons.install.hint")}
          style={styles.pageHeader}
        />

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
          {!!installFeedback && <InlineFeedback feedback={installFeedback} />}
        </Surface>

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
                  <View style={styles.addonItem}>
                    <Surface style={styles.addonCard}>
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
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          "addons.installed.confirmRemove",
                          { name: item.manifest.name },
                        )}
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
                                onPress: () =>
                                  uninstallMutation.mutate(item.id),
                              },
                            ],
                          );
                        }}
                      >
                        {isRemoving ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.error}
                          />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={19}
                            color={colors.error}
                          />
                        )}
                      </Pressable>
                    </Surface>
                    {removalError?.addonId === item.id && (
                      <InlineFeedback
                        feedback={{
                          tone: "error",
                          message: removalError.message,
                        }}
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
      </ContentBoundary>
    </PageLayout>
  );
}

function InlineFeedback({
  feedback,
  actionLabel,
  onAction,
}: {
  feedback: Feedback;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const isError = feedback.tone === "error";

  return (
    <Surface variant={isError ? "danger" : "accent"} style={styles.feedback}>
      <Ionicons
        name={isError ? "alert-circle-outline" : "checkmark-circle-outline"}
        size={18}
        color={isError ? colors.error : colors.success}
      />
      <Text style={[styles.feedbackText, { color: colors.text }]}>
        {feedback.message}
      </Text>
      {!!actionLabel && !!onAction && (
        <AppButton
          label={actionLabel}
          size="small"
          variant="ghost"
          onPress={onAction}
        />
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: uiSpacing.xxl,
  },
  pageHeader: {
    marginBottom: uiSpacing.xxxl,
  },
  installSection: {
    gap: uiSpacing.lg,
  },
  sectionTitle: {
    ...uiTypography.title,
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
  removeButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  feedback: {
    minHeight: uiTouchTarget,
    paddingVertical: uiSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  feedbackText: {
    ...uiTypography.body,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
