import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import {
  playbackSessionsQueryKey,
  useRemoteControl,
} from "../useRemoteControl";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const session = {
  deviceId: "living-room",
  deviceName: "Living room",
  itemId: "movie-1",
  itemTitle: "Example movie",
  status: "playing" as const,
  position: 120,
  duration: 7200,
  lastUpdate: 1,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function setAnonymousAuth() {
  useAuthStore.setState({
    user: null,
    deviceId: "this-device",
    isAuthenticated: false,
    isHydrated: false,
    accessToken: null,
    refreshToken: null,
  });
}

function setAuthenticatedAuth() {
  useAuthStore.setState({
    deviceId: "this-device",
    isAuthenticated: true,
    isHydrated: true,
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });
}

describe("useRemoteControl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAnonymousAuth();
  });

  it("does not poll or post session state before authentication is ready", async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result, unmount } = renderHook(() => useRemoteControl(), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(api.get).not.toHaveBeenCalled();

    act(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        isHydrated: false,
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
    });
    await act(async () => {
      await Promise.resolve();
      result.current.updateStatus({ status: "playing" });
      result.current.sendCommand({
        targetDeviceId: "living-room",
        action: "pause",
      });
      await Promise.resolve();
    });

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();

    unmount();
    queryClient.clear();
  });

  it("starts authenticated polling and clears user-specific sessions on logout", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { sessions: [session] } });
    const { queryClient, wrapper } = createWrapper();
    const { result, unmount } = renderHook(() => useRemoteControl(), {
      wrapper,
    });

    act(() => {
      setAuthenticatedAuth();
    });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() =>
      expect(result.current.otherActiveSessions).toEqual([session]),
    );

    await act(async () => {
      result.current.updateStatus({ status: "paused" });
      result.current.sendCommand({
        targetDeviceId: "living-room",
        action: "play",
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/sessions/update", {
        status: "paused",
      }),
    );
    expect(api.post).toHaveBeenCalledWith("/api/sessions/command", {
      targetDeviceId: "living-room",
      action: "play",
      data: undefined,
    });

    act(() => {
      setAnonymousAuth();
    });

    await waitFor(() => expect(result.current.sessions).toEqual([]));
    expect(queryClient.getQueryData(playbackSessionsQueryKey)).toBeUndefined();

    unmount();
    queryClient.clear();
  });
});
