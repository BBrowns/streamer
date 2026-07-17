import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useInfiniteSearch, useSearch } from "../useSearch";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

describe("useSearch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes an AbortSignal and cancels the obsolete HTTP request", async () => {
    const signals: AbortSignal[] = [];
    (api.get as jest.Mock).mockImplementation(
      (_url: string, config: { signal: AbortSignal }) => {
        signals.push(config.signal);
        return new Promise(() => {});
      },
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { rerender, unmount } = renderHook(
      ({ query }: { query: string }) => useSearch(query),
      {
        initialProps: { query: "Dune" },
        wrapper,
      },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ query: "Alien" });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);

    unmount();
    queryClient.clear();
  });

  it("requests the server suggestion contract and does not slice its response", async () => {
    const metas = Array.from({ length: 7 }, (_, index) => ({
      id: String(index),
      type: "movie" as const,
      name: `Title ${index}`,
      providerIds: [],
      providerNames: [],
    }));
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        metas,
        providers: [],
        providersByContent: {},
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: [],
        partial: false,
        total: 7,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useSearch("  Dune  ", {
          mode: "suggestions",
          type: "movie",
          limit: 6,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith(
      "/api/search?q=Dune&mode=suggestions&type=movie&limit=6",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data?.metas).toHaveLength(7);
    queryClient.clear();
  });

  it("loads and merges cursor pages without hiding results beyond the first page", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      const isSecondPage = url.includes("cursor=2");
      const metas = isSecondPage
        ? [{ id: "3", type: "movie", name: "Dune Messiah" }]
        : [
            { id: "1", type: "movie", name: "Dune" },
            { id: "2", type: "series", name: "Dune: Prophecy" },
          ];
      return Promise.resolve({
        data: {
          metas,
          total: 3,
          nextCursor: isSecondPage ? undefined : "2",
          providers: [{ id: "catalog", name: "Catalog" }],
          providersByContent: Object.fromEntries(
            metas.map((meta) => [`${meta.type}:${meta.id}`, ["catalog"]]),
          ),
          attemptedProviders: 1,
          successfulProviders: 1,
          failedProviderIds: [],
          partial: false,
        },
      });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useInfiniteSearch("Dune", {
          mode: "results",
          type: "all",
          limit: 2,
          minimumLength: 2,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.metas).toHaveLength(2));
    expect(result.current.pageCount).toBe(1);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.metas).toHaveLength(3));
    expect(result.current.pageCount).toBe(2);
    expect(result.current.hasNextPage).toBe(false);
    expect(api.get).toHaveBeenNthCalledWith(
      1,
      "/api/search?q=Dune&mode=results&type=all&limit=2",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/api/search?q=Dune&mode=results&type=all&limit=2&cursor=2",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    queryClient.clear();
  });
});
