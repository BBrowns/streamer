/** A user-visible in-app notification. */
export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: InAppNotification[];
}

export interface MarkAllNotificationsReadResponse {
  status: "success";
  updatedCount: number;
}
