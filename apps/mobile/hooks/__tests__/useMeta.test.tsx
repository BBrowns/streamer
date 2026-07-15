import React, { type PropsWithChildren } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../services/api";
import { getMetaLoadFailureKind, useMeta } from "../useMeta";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("getMetaLoadFailureKind", () => {
  it("distinguishes an unavailable title from connection and temporary failures", () => {
    expect(getMetaLoadFailureKind({ response: { status: 404 } })).toBe(
      "notFound",
    );
    expect(getMetaLoadFailureKind({ status: 404 })).toBe("notFound");
    expect(getMetaLoadFailureKind({ code: "ERR_NETWORK", request: {} })).toBe(
      "network",
    );
    expect(getMetaLoadFailureKind(new Error("Network request failed"))).toBe(
      "network",
    );
    expect(getMetaLoadFailureKind({ response: { status: 503 } })).toBe(
      "temporary",
    );
    expect(getMetaLoadFailureKind(new Error("Unexpected response"))).toBe(
      "temporary",
    );
  });
});

describe("useMeta", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not repeatedly request a confirmed missing title", async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    const { wrapper, queryClient } = createWrapper();

    const { result, unmount } = renderHook(() => useMeta("movie", "missing"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(getMetaLoadFailureKind(result.current.error)).toBe("notFound");

    unmount();
    queryClient.clear();
  });

  it("treats a successful response without metadata as unavailable", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: {} });
    const { wrapper, queryClient } = createWrapper();

    const { result, unmount } = renderHook(() => useMeta("movie", "empty"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(getMetaLoadFailureKind(result.current.error)).toBe("notFound");

    unmount();
    queryClient.clear();
  });

  it("keeps an exact cached detail visible when a background refresh fails", async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    const { wrapper, queryClient } = createWrapper();
    const cachedMeta = {
      id: "cached",
      type: "movie" as const,
      name: "Cached title",
      poster: "https://example.test/poster.jpg",
      description: "Previously loaded full metadata",
    };
    queryClient.setQueryData(["meta", "movie", "cached"], cachedMeta, {
      updatedAt: Date.now() - 11 * 60 * 1000,
    });

    const { result, unmount } = renderHook(() => useMeta("movie", "cached"), {
      wrapper,
    });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual(cachedMeta);

    unmount();
    queryClient.clear();
  });
});
