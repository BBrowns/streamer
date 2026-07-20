import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  markAllNotificationsReadResponseSchema,
  notificationsResponseSchema,
  type InAppNotification,
} from "@streamer/shared";
import { api } from "../services/api";

export type Notification = InAppNotification;

export const notificationKeys = {
  all: ["notifications"] as const,
};

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: notificationKeys.all,
    queryFn: async () => {
      const { data } = await api.get<{ notifications: Notification[] }>(
        "/api/notifications",
      );
      return notificationsResponseSchema.parse(data).notifications;
    },
    refetchInterval: 30000,
  });

  const markAsRead = useMutation({
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
    refetch: query.refetch,
    isRefetching: query.isRefetching,
    markAsRead,
    markAllAsRead,
  };
}
