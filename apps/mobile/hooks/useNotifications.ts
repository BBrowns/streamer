import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  markAllNotificationsReadResponseSchema,
  notificationsResponseSchema,
  type InAppNotification,
} from "@streamer/shared";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { isRateLimitError } from "../services/rateLimit";
import { useAuthStore } from "../stores/authStore";

export type Notification = InAppNotification;

export const notificationKeys = {
  all: ["notifications"] as const,
};

type NotificationPollingState = {
  isAuthenticated: boolean;
  credentialsHydrated: boolean;
  appState: AppStateStatus | null;
  documentVisibility: DocumentVisibilityState | null;
};

export function shouldPollNotifications({
  isAuthenticated,
  credentialsHydrated,
  appState,
  documentVisibility,
}: NotificationPollingState): boolean {
  return (
    credentialsHydrated &&
    isAuthenticated &&
    appState === "active" &&
    documentVisibility !== "hidden"
  );
}

function getDocumentVisibility(): DocumentVisibilityState | null {
  if (Platform.OS !== "web" || typeof document === "undefined") return null;
  return document.visibilityState;
}

export function useNotifications({ poll = false }: { poll?: boolean } = {}) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const credentialsHydrated = useAuthStore(
    (state) => state.credentialsHydrated,
  );
  const [appState, setAppState] = useState<AppStateStatus | null>(
    AppState.currentState,
  );
  const [documentVisibility, setDocumentVisibility] =
    useState<DocumentVisibilityState | null>(getDocumentVisibility);
  const [rateLimitBlockedUntil, setRateLimitBlockedUntil] = useState(0);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      setAppState(nextState);
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    if (Platform.OS !== "web" || typeof document === "undefined") {
      return () => subscription.remove();
    }

    const handleVisibilityChange = () => {
      setDocumentVisibility(document.visibilityState);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscription.remove();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const canPoll = shouldPollNotifications({
    isAuthenticated,
    credentialsHydrated,
    appState,
    documentVisibility,
  });
  const cooldownActive = rateLimitBlockedUntil > Date.now();
  const pollingEnabled = poll && canPoll && !cooldownActive;

  const query = useQuery({
    queryKey: notificationKeys.all,
    queryFn: async () => {
      const { data } = await api.get<{ notifications: Notification[] }>(
        "/api/notifications",
      );
      return notificationsResponseSchema.parse(data).notifications;
    },
    enabled: canPoll,
    retry: false,
    refetchInterval: pollingEnabled ? 30000 : false,
  });

  useEffect(() => {
    if (!isRateLimitError(query.error)) return;

    const blockedUntil = Date.now() + query.error.retryAfterMs;
    setRateLimitBlockedUntil((current) => Math.max(current, blockedUntil));
    const timeout = setTimeout(
      () => setRateLimitBlockedUntil(0),
      query.error.retryAfterMs,
    );
    return () => clearTimeout(timeout);
  }, [query.error]);

  const refetch = useCallback(() => query.refetch(), [query.refetch]);
  const rateLimitRetryAfterMs = useMemo(
    () =>
      isRateLimitError(query.error)
        ? Math.max(0, rateLimitBlockedUntil - Date.now())
        : null,
    [query.error, rateLimitBlockedUntil],
  );

  const markAsRead = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/api/notifications/${id}/read`);
      return data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = queryClient.getQueryData<Notification[]>(
        notificationKeys.all,
      );
      queryClient.setQueryData<Notification[]>(
        notificationKeys.all,
        (current) =>
          current?.map((notification) =>
            notification.id === id
              ? { ...notification, read: true }
              : notification,
          ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.all, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllAsRead = useMutation({
    retry: false,
    mutationFn: async () => {
      const { data } = await api.patch("/api/notifications/read-all");
      return markAllNotificationsReadResponseSchema.parse(data);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = queryClient.getQueryData<Notification[]>(
        notificationKeys.all,
      );
      queryClient.setQueryData<Notification[]>(
        notificationKeys.all,
        (current) =>
          current?.map((notification) => ({ ...notification, read: true })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.all, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    notifications: query.data ?? [],
    unreadCount: (query.data ?? []).filter((n) => !n.read).length,
    isLoading: query.isLoading,
    isError: query.isError,
    isRateLimited: isRateLimitError(query.error),
    rateLimitRetryAfterMs,
    refetch,
    isRefetching: query.isRefetching,
    markAsRead,
    markAllAsRead,
  };
}
