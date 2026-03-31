import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  // Fetch all notifications
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<{ notifications: Notification[] }>(
        "/api/notifications",
      );
      return data.notifications || [];
    },
    // Poll every 30 seconds for new notifications
    refetchInterval: 30000,
  });

  // Mark a single notification as read
  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/api/notifications/${id}/read`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return {
    notifications: query.data ?? [],
    unreadCount: (query.data ?? []).filter((n) => !n.read).length,
    isLoading: query.isLoading,
    isError: query.isError,
    markAsRead,
  };
}
