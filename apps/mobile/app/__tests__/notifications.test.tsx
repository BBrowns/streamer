import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import NotificationsScreen from "../notifications";

const markAsRead = {
  mutate: jest.fn(),
  isPending: false,
  variables: undefined,
};
const markAllAsRead = {
  mutate: jest.fn(),
  isPending: false,
  isError: false,
};
const mockRefetch = jest.fn().mockResolvedValue(undefined);
let mockNotificationState: Record<string, unknown>;
const testNow = new Date("2026-07-18T15:00:00.000Z");

jest.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => mockNotificationState,
}));

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: "#08090C",
      card: "#111318",
      surfaceElevated: "#181B21",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
      primary: "#F4F5F7",
      onPrimary: "#08090C",
      focus: "#8792FF",
      error: "#FF7087",
    },
  }),
}));

jest.mock("../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key: string, options?: { count?: number; title?: string }) => {
      const labels: Record<string, string> = {
        "notifications.eyebrow": "Inbox",
        "notifications.title": "Notifications",
        "notifications.allCaughtUpDescription": "You're all caught up.",
        "notifications.markAllRead": "Mark all read",
        "notifications.markAllReadHint":
          "Marks all unread notifications as read.",
        "notifications.emptyTitle": "You're all caught up",
        "notifications.emptyDescription": "Updates will appear here.",
        "notifications.loading": "Loading notifications",
        "notifications.errorTitle": "Notifications couldn't load",
        "notifications.errorDescription":
          "Check your connection and try again.",
        "notifications.groups.today": "Today",
        "notifications.groups.thisWeek": "This week",
        "notifications.groups.earlier": "Earlier",
        "notifications.unread": "Unread",
        "notifications.markAsReadHint": "Marks this notification as read.",
        "common.retry": "Retry",
      };
      if (key === "notifications.unreadCount") {
        return `${options?.count ?? 0} unread notifications`;
      }
      if (key === "notifications.markAllReadA11y") {
        return `Mark all ${options?.count ?? 0} unread notifications as read`;
      }
      if (key === "notifications.markAsReadA11y") {
        return `Mark ${options?.title ?? "notification"} as read`;
      }
      return labels[key] ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

const unreadNotification = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  title: "Download complete",
  message: "A title is ready offline.",
  read: false,
  createdAt: "2026-07-18T12:00:00.000Z",
};

const readNotification = {
  id: "00000000-0000-4000-8000-000000000003",
  userId: "00000000-0000-4000-8000-000000000002",
  title: "Library updated",
  message: "A title was saved.",
  read: true,
  createdAt: "2026-07-10T12:00:00.000Z",
};

describe("NotificationsScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(testNow);
    jest.clearAllMocks();
    markAllAsRead.isError = false;
    mockNotificationState = {
      notifications: [unreadNotification, readNotification],
      unreadCount: 1,
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: mockRefetch,
      markAsRead,
      markAllAsRead,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("groups the inbox and exposes only real read actions", () => {
    const screen = render(<NotificationsScreen />);

    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
    expect(screen.getByTestId("notifications-mark-all-read")).toBeTruthy();

    fireEvent.press(
      screen.getByTestId(`notification-${unreadNotification.id}`),
    );
    expect(markAsRead.mutate).toHaveBeenCalledWith(
      unreadNotification.id,
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    fireEvent.press(screen.getByTestId("notifications-mark-all-read"));
    expect(markAllAsRead.mutate).toHaveBeenCalledTimes(1);
  });

  it("uses a clear, non-interactive empty state", () => {
    mockNotificationState = {
      ...mockNotificationState,
      notifications: [],
      unreadCount: 0,
    };
    const screen = render(<NotificationsScreen />);

    expect(screen.getByTestId("notifications-empty-state")).toBeTruthy();
    expect(screen.queryByTestId("notifications-mark-all-read")).toBeNull();
  });

  it("offers a working retry when loading the inbox fails", () => {
    mockNotificationState = {
      ...mockNotificationState,
      notifications: [],
      unreadCount: 0,
      isError: true,
    };
    const screen = render(<NotificationsScreen />);

    fireEvent.press(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
