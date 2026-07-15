import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { MetaLoadFailureKind } from "../../hooks/useMeta";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "../ui/AppButton";
import { PageLayout } from "../ui/PageLayout";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";

type DetailLoadStateKind = "loading" | MetaLoadFailureKind;

interface DetailLoadStateProps {
  kind: DetailLoadStateKind;
  retrying?: boolean;
  onBack: () => void;
  onRetry?: () => void;
  onSupport?: () => void;
}

const stateIcon: Record<MetaLoadFailureKind, keyof typeof Ionicons.glyphMap> = {
  notFound: "film-outline",
  network: "cloud-offline-outline",
  temporary: "alert-circle-outline",
};

export function DetailLoadState({
  kind,
  retrying = false,
  onBack,
  onRetry,
  onSupport,
}: DetailLoadStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isLoading = kind === "loading";
  const title = isLoading
    ? t("detail.loadState.loadingTitle")
    : t(`detail.loadState.${kind}Title`);
  const description = isLoading
    ? t("detail.loadState.loadingDescription")
    : t(`detail.loadState.${kind}Description`);

  return (
    <PageLayout
      contained={false}
      testID={`detail-load-state-${kind}`}
      contentContainerStyle={styles.pageContent}
    >
      <View style={styles.backRow}>
        <AppButton
          label={t("detail.back")}
          icon="chevron-back"
          variant="ghost"
          onPress={onBack}
          testID="detail-load-back"
        />
      </View>

      <View
        style={styles.center}
        accessibilityLiveRegion={isLoading ? "polite" : "assertive"}
      >
        <Text style={[styles.eyebrow, { color: colors.tint }]}>
          {t("detail.loadState.eyebrow")}
        </Text>
        <View
          style={[
            styles.iconSurface,
            { backgroundColor: colors.surfaceElevated },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator
              testID="detail-load-spinner"
              size="large"
              color={colors.tint}
              accessibilityLabel={title}
            />
          ) : (
            <Ionicons name={stateIcon[kind]} size={30} color={colors.tint} />
          )}
        </View>

        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>

        {!isLoading && onRetry ? (
          <View style={styles.actions}>
            <AppButton
              label={t("detail.loadState.retry")}
              icon="refresh"
              variant="primary"
              onPress={onRetry}
              loading={retrying}
              testID="detail-load-retry"
            />
            {onSupport ? (
              <AppButton
                label={t(
                  kind === "notFound"
                    ? "detail.loadState.reviewAddons"
                    : "detail.loadState.sourcesDevices",
                )}
                icon={
                  kind === "notFound"
                    ? "extension-puzzle-outline"
                    : "options-outline"
                }
                variant="secondary"
                onPress={onSupport}
                testID="detail-load-support"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    flex: 1,
    paddingHorizontal: uiSpacing.xxl,
    paddingVertical: uiSpacing.xl,
  },
  backRow: {
    alignItems: "flex-start",
  },
  center: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 72,
  },
  eyebrow: {
    ...uiTypography.sectionLabel,
    textTransform: "uppercase",
    marginBottom: uiSpacing.lg,
  },
  iconSurface: {
    width: 72,
    height: 72,
    borderRadius: uiRadii.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: uiSpacing.xxl,
  },
  title: {
    ...uiTypography.headline,
    textAlign: "center",
    marginBottom: uiSpacing.md,
  },
  description: {
    ...uiTypography.body,
    maxWidth: 460,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: uiSpacing.md,
    marginTop: uiSpacing.xxl,
  },
});
