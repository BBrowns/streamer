import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSync } from "../../hooks/useSync";
import { useAuthStore } from "../../stores/authStore";
import { InlineNotice } from "./InlineNotice";
import { getNativePointerEvents } from "../../lib/platformStyles";

export function SyncStatusBanner() {
  const { t } = useTranslation();
  const { retry, status } = useSync();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionHealth = useAuthStore((state) => state.sessionHealth);
  const sessionIssue = useAuthStore((state) => state.sessionIssue);

  const isDegraded =
    status.state === "degraded" ||
    sessionHealth === "degraded" ||
    sessionHealth === "needs-attention";
  if (!isAuthenticated || !isDegraded) return null;

  const reason =
    status.reason ??
    (sessionIssue === "rate-limited" ? "rate-limited" : "auth-refresh");

  const message =
    reason === "rate-limited"
      ? t("syncStatus.rateLimited", {
          defaultValue: "Sync is temporarily rate-limited",
        })
      : reason === "auth-refresh"
        ? t("syncStatus.authRefresh", {
            defaultValue: "Session refresh is temporarily unavailable",
          })
        : t("syncStatus.transport", {
            defaultValue: "Sync connection temporarily unavailable",
          });

  return (
    <View
      pointerEvents={getNativePointerEvents("box-none")}
      testID="sync-status-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.container}
    >
      <InlineNotice
        tone="warning"
        message={message}
        actionLabel={t("syncStatus.retry", { defaultValue: "Retry sync" })}
        onAction={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 120,
  },
});
