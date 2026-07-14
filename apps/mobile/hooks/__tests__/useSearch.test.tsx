import React, { type PropsWithChildren } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useSearch } from "../useSearch";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

describe("useSearch", () => {
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
});
