import { Ionicons } from "@expo/vector-icons";
import type { InAppNotification } from "@streamer/shared";
import { Stack } from "expo-router";
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
import { AdaptiveRoutePage } from "../components/ui/AdaptiveRoutePage";
import { EmptyState } from "../components/ui/EmptyState";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../components/ui/designSystem";
import { useNotifications } from "../hooks/useNotifications";
import { useTheme } from "../hooks/useTheme";
import { useWebPressableActivation } from "../hooks/useWebPressableActivation";
import { useWindowClass } from "../hooks/useWindowClass";

const groupTranslationKeys = {
  today: "notifications.groups.today",
  thisWeek: "notifications.groups.thisWeek",
  earlier: "notifications.groups.earlier",
} as const;

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { isCompact } = useWindowClass();
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
    <>
      <Stack.Screen
        options={{
          title: t("notifications.title"),
          headerShown: isCompact,
          headerBackTitle: t("navigation.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <AdaptiveRoutePage
        title={t("notifications.title")}
        eyebrow={t("notifications.eyebrow")}
        description={description}
        boundary="utilityNarrow"
        testID="notifications-screen"
        boundaryStyle={styles.contentBoundary}
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
      >
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
            <ActivityIndicator color={colors.textSecondary} />
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
                tintColor={colors.textSecondary}
              />
            }
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </AdaptiveRoutePage>
    </>
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
  const { colors } = useTheme();
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
          color={isUnread ? colors.info : colors.textSecondary}
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
          style={[styles.unreadDot, { backgroundColor: colors.info }]}
        />
      ) : null}
    </>
  );

  if (!isUnread) {
    return (
      <View
        testID={`notification-${notification.id}`}
        style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
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
          borderBottomColor: colors.borderSubtle,
          opacity: busy ? 0.56 : pressed ? 0.76 : 1,
        },
        Platform.OS === "web" && hovered && !busy
          ? { backgroundColor: colors.stateHover }
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: uiSpacing.lg,
    paddingHorizontal: uiSpacing.sm,
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
