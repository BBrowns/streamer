import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import { authService } from "../../services/authService";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";

jest.mock("../../services/authService", () => ({
  authService: { login: jest.fn(), register: jest.fn() },
}));

jest.mock("../../services/api", () => ({
  api: { post: jest.fn() },
}));

describe("useAuth pending add-ons", () => {
  afterEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      pendingAddonUrls: [],
      accessToken: null,
      refreshToken: null,
    });
  });

  it("invalidates add-on, catalog, and search caches after login flush", async () => {
    const pendingUrl = "https://search-addon.test/manifest.json";
    useAuthStore.setState({ pendingAddonUrls: [pendingUrl] });
    (authService.login as jest.Mock).mockResolvedValue({
      user: {
        id: "profile-a",
        email: "a@example.test",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
      tokens: { accessToken: "access", refreshToken: "refresh" },
    });
    (api.post as jest.Mock).mockResolvedValue({ data: { id: "addon-a" } });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({
        email: "a@example.test",
        password: "password",
      });
    });

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/addons", {
        transportUrl: pendingUrl,
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["addons"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["catalog"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["search"] });

    unmount();
    queryClient.clear();
  });
});
