import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WatchHistoryPage, WatchProgress } from "@streamer/shared";
import { api } from "../../services/api";
import {
  useClearWatchHistory,
  useRemoveWatchHistoryEntry,
  useWatchHistory,
  watchHistoryKeys,
} from "../useWatchHistory";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn(), delete: jest.fn() },
}));

jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

const entry = (id: string): WatchProgress => ({
  id,
  userId: "user-1",
  type: "series",
  itemId: "series-1",
  season: 1,
  episode: id === "entry-1" ? 1 : 2,
  currentTime: 600,
  duration: 1200,
  title: "Example series",
  poster: null,
  lastWatched: "2026-07-18T10:00:00.000Z",
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useWatchHistory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads cursor pages without dropping completed entries", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      const page: WatchHistoryPage = url.includes("cursor=cursor-2")
        ? { items: [entry("entry-2")] }
        : { items: [entry("entry-1")], nextCursor: "cursor-2" };
      return Promise.resolve({ data: page });
    });
    const { queryClient, wrapper } = createWrapper();
    const { result, unmount } = renderHook(() => useWatchHistory(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith(
      "/api/library/history?limit=24",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => item.id)).toEqual([
      "entry-1",
      "entry-2",
    ]);
    expect(api.get).toHaveBeenLastCalledWith(
      "/api/library/history?limit=24&cursor=cursor-2",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    unmount();
    queryClient.clear();
  });

  it("optimistically removes one entry or all entries from every loaded page", async () => {
    (api.delete as jest.Mock).mockResolvedValue({});
    const { queryClient, wrapper } = createWrapper();
    const initial: WatchHistoryPage = {
      items: [entry("entry-1"), entry("entry-2")],
      nextCursor: "cursor-3",
    };
    queryClient.setQueryData(watchHistoryKeys.list(), {
      pages: [initial],
      pageParams: [""],
    });
    const { result, unmount } = renderHook(
      () => ({
        remove: useRemoveWatchHistoryEntry(),
        clear: useClearWatchHistory(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.remove.mutateAsync("entry-1");
    });
    expect(api.delete).toHaveBeenCalledWith("/api/library/history/entry-1");
    expect(
      queryClient
        .getQueryData<{ pages: WatchHistoryPage[] }>(watchHistoryKeys.list())
        ?.pages[0].items.map((item) => item.id),
    ).toEqual(["entry-2"]);

    await act(async () => {
      await result.current.clear.mutateAsync();
    });
    expect(api.delete).toHaveBeenLastCalledWith("/api/library/history");
    expect(
      queryClient.getQueryData<{ pages: WatchHistoryPage[] }>(
        watchHistoryKeys.list(),
      )?.pages[0].items,
    ).toEqual([]);

    unmount();
    queryClient.clear();
  });
});
