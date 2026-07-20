import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { api } from "../../services/api";
import { useNotifications } from "../useNotifications";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn(), patch: jest.fn() },
}));

const notifications = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    title: "Download complete",
    message: "A title is ready offline.",
    read: false,
    createdAt: "2026-07-18T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    userId: "00000000-0000-4000-8000-000000000002",
    title: "Library updated",
    message: "A title was saved.",
    read: true,
    createdAt: "2026-07-17T12:00:00.000Z",
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue({ data: { notifications } });
  });

  it("marks all unread notifications optimistically through the scoped endpoint", async () => {
    let resolvePatch:
      | ((value: { data: { status: string; updatedCount: number } }) => void)
      | undefined;
    (api.patch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(() => useNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    act(() => result.current.markAllAsRead.mutate());

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/notifications/read-all"),
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    await act(async () =>
      resolvePatch?.({ data: { status: "success", updatedCount: 1 } }),
    );
    await waitFor(() =>
      expect(result.current.markAllAsRead.isPending).toBe(false),
    );

    unmount();
    queryClient.clear();
  });

  it("restores the unread state when a read mutation fails", async () => {
    (api.patch as jest.Mock).mockRejectedValue(
      new Error("Network unavailable"),
    );
    const { wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(() => useNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    act(() => result.current.markAsRead.mutate(notifications[0].id));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        `/api/notifications/${notifications[0].id}/read`,
      ),
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    unmount();
    queryClient.clear();
  });
});
