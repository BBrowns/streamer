import { Ionicons } from "@expo/vector-icons";
import type { InAppNotification } from "@streamer/shared";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  formatNotificationTimestamp,
  groupNotificationsByRecency,
  type NotificationGroup,
} from "../components/notifications/notificationPresentation";
import { AppButton } from "../components/ui/AppButton";
import { ContentBoundary } from "../components/ui/ContentBoundary";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLayout } from "../components/ui/PageLayout";
import {
  getWebFocusStyle,
  uiLayout,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../components/ui/designSystem";
import { useNotifications } from "../hooks/useNotifications";
import { useTheme } from "../hooks/useTheme";
import { useWebPressableActivation } from "../hooks/useWebPressableActivation";

const groupTranslationKeys = {
  today: "notifications.groups.today",
  thisWeek: "notifications.groups.thisWeek",
  earlier: "notifications.groups.earlier",
} as const;

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    isRefetching,
    refetch,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const [failedNotificationId, setFailedNotificationId] = useState<
    string | null
  >(null);
  const groups = useMemo(
    () => groupNotificationsByRecency(notifications),
    [notifications],
  );
  const retryFailedNotification = useCallback(() => {
    if (!failedNotificationId) return;
    markAsRead.mutate(failedNotificationId, {
      onSuccess: () => setFailedNotificationId(null),
    });
  }, [failedNotificationId, markAsRead]);
  const markNotificationRead = useCallback(
    (notificationId: string) => {
      markAsRead.mutate(notificationId, {
        onSuccess: () => setFailedNotificationId(null),
        onError: () => setFailedNotificationId(notificationId),
      });
    },
    [markAsRead],
  );

  const description = unreadCount
    ? t("notifications.unreadCount", { count: unreadCount })
    : t("notifications.allCaughtUpDescription");

  return (
    <PageLayout contained={false} testID="notifications-screen">
      <ContentBoundary
        maxWidth={uiLayout.readingMaxWidth}
        style={styles.contentBoundary}
      >
        <PageHeader
          eyebrow={t("notifications.eyebrow")}
          title={t("notifications.title")}
          description={description}
          actions={
            unreadCount > 0 ? (
              <AppButton
                testID="notifications-mark-all-read"
                label={t("notifications.markAllRead")}
                icon="checkmark-done-outline"
                variant="ghost"
                loading={markAllAsRead.isPending}
                onPress={() => markAllAsRead.mutate()}
                accessibilityLabel={t("notifications.markAllReadA11y", {
                  count: unreadCount,
                })}
                accessibilityHint={t("notifications.markAllReadHint")}
              />
            ) : null
          }
        />

        {markAllAsRead.isError ? (
          <ActionError
            message={t("notifications.markAllReadError")}
            onRetry={() => markAllAsRead.mutate()}
          />
        ) : null}
        {failedNotificationId ? (
          <ActionError
            message={t("notifications.markReadError")}
            onRetry={retryFailedNotification}
          />
        ) : null}

        {isLoading ? (
          <View
            accessibilityLabel={t("notifications.loading")}
            style={styles.loadingState}
          >
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : isError ? (
          <EmptyState
            testID="notifications-error-state"
            icon="cloud-offline-outline"
            title={t("notifications.errorTitle")}
            description={t("notifications.errorDescription")}
            actionLabel={t("common.retry")}
            onAction={() => void refetch()}
            fill
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            testID="notifications-empty-state"
            icon="checkmark-circle-outline"
            title={t("notifications.emptyTitle")}
            description={t("notifications.emptyDescription")}
            fill
          />
        ) : (
          <SectionList<InAppNotification, NotificationGroup>
            testID="notifications-list"
            sections={groups}
            style={styles.list}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section }) => (
              <Text
                accessibilityRole="header"
                style={[styles.sectionHeader, { color: colors.textSecondary }]}
              >
                {t(groupTranslationKeys[section.key])}
              </Text>
            )}
            renderItem={({ item }) => (
              <NotificationRow
                notification={item}
                timestamp={formatNotificationTimestamp(
                  item.createdAt,
                  i18n.language,
                )}
                busy={markAsRead.isPending && markAsRead.variables === item.id}
                onMarkAsRead={markNotificationRead}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={colors.tint}
              />
            }
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ContentBoundary>
    </PageLayout>
  );
}

function ActionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.actionError, { backgroundColor: colors.error + "14" }]}
    >
      <Ionicons name="warning-outline" size={18} color={colors.error} />
      <Text style={[styles.actionErrorText, { color: colors.text }]}>
        {message}
      </Text>
      <AppButton
        label={t("common.retry")}
        onPress={onRetry}
        variant="ghost"
        size="small"
      />
    </View>
  );
}

function NotificationRow({
  notification,
  timestamp,
  busy,
  onMarkAsRead,
}: {
  notification: InAppNotification;
  timestamp: string;
  busy: boolean;
  onMarkAsRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const activate = useCallback(() => {
    if (!notification.read && !busy) onMarkAsRead(notification.id);
  }, [busy, notification.id, notification.read, onMarkAsRead]);
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(activate);
  const isUnread = !notification.read;
  const body = (
    <>
      <View style={styles.iconColumn}>
        <Ionicons
          name={isUnread ? "notifications-outline" : "checkmark-outline"}
          size={20}
          color={isUnread ? colors.tint : colors.textSecondary}
        />
      </View>
      <View style={styles.copy}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            { color: colors.text },
            isUnread && styles.titleUnread,
          ]}
        >
          {notification.title}
        </Text>
        <Text
          numberOfLines={3}
          style={[styles.message, { color: colors.textSecondary }]}
        >
          {notification.message}
        </Text>
        {timestamp ? (
          <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
            {timestamp}
          </Text>
        ) : null}
      </View>
      {isUnread ? (
        <View
          accessibilityLabel={t("notifications.unread")}
          style={[styles.unreadDot, { backgroundColor: colors.tint }]}
        />
      ) : null}
    </>
  );

  if (!isUnread) {
    return (
      <View
        testID={`notification-${notification.id}`}
        style={[styles.row, { backgroundColor: colors.card }]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      {...webPressableProps}
      testID={`notification-${notification.id}`}
      accessibilityRole="button"
      accessibilityLabel={t("notifications.markAsReadA11y", {
        title: notification.title,
      })}
      accessibilityHint={t("notifications.markAsReadHint")}
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={activate}
      style={({ hovered, pressed }: any) => [
        styles.row,
        {
          backgroundColor: isDark ? colors.tint + "12" : colors.tint + "0C",
          borderColor: colors.tint + "42",
          opacity: busy ? 0.56 : pressed ? 0.76 : 1,
        },
        Platform.OS === "web" && hovered && !busy
          ? {
              backgroundColor: isDark ? colors.tint + "1C" : colors.tint + "16",
            }
          : null,
        Platform.OS === "web" && isKeyboardFocused
          ? getWebFocusStyle(colors.focus)
          : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contentBoundary: {
    flex: 1,
    paddingTop: uiSpacing.xxl,
    paddingBottom: uiSpacing.section,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: uiSpacing.section,
    gap: uiSpacing.sm,
  },
  list: { flex: 1 },
  sectionHeader: {
    ...uiTypography.sectionLabel,
    marginTop: uiSpacing.xxl,
    marginBottom: uiSpacing.sm,
    textTransform: "uppercase",
  },
  row: {
    minHeight: 88,
    borderRadius: uiRadii.card,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: uiSpacing.lg,
    gap: uiSpacing.md,
  },
  iconColumn: {
    width: uiTouchTarget - 8,
    minHeight: uiTouchTarget - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  title: { ...uiTypography.label },
  titleUnread: { fontFamily: uiTypography.control.fontFamily },
  message: { ...uiTypography.body, marginTop: uiSpacing.xxs },
  timestamp: { ...uiTypography.caption, marginTop: uiSpacing.sm },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: uiRadii.pill,
    marginTop: uiSpacing.sm,
  },
  actionError: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.control,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    paddingLeft: uiSpacing.md,
    marginBottom: uiSpacing.lg,
  },
  actionErrorText: { ...uiTypography.caption, flex: 1 },
});
