import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { DeviceEventEmitter, Text } from "react-native";
import { SyncProvider } from "../SyncContext";
import { useSync } from "../../hooks/useSync";
import { SyncClient, type SyncAuthState } from "../../services/syncClient";
import { useAuthStore } from "../../stores/authStore";

type FakeSocket = {
  readyState: number;
  close: jest.Mock;
  send: jest.Mock;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
};

function CommandConsumer() {
  const { sendMessage } = useSync();
  return <Text>{sendMessage ? "consumer" : "missing"}</Text>;
}

describe("SyncProvider", () => {
  let auth: SyncAuthState;
  let socket: FakeSocket;
  let client: SyncClient;
  let createSocket: jest.Mock;
  let queryClient: QueryClient;

  beforeEach(async () => {
    auth = {
      isAuthenticated: true,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      deviceId: "device-id",
      tokenExpiresAt: Date.now() + 60_000,
    };
    socket = {
      readyState: 0,
      close: jest.fn(),
      send: jest.fn(),
    };
    createSocket = jest.fn(() => socket as unknown as WebSocket);
    client = new SyncClient({
      getAuth: () => auth,
      createSocket,
      refreshAuth: jest.fn().mockResolvedValue("access-token"),
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        accessToken: "access-token",
        refreshToken: "refresh-token",
        deviceId: "device-id",
        tokenExpiresAt: Date.now() + 60_000,
      });
    });
  });

  afterEach(async () => {
    client.stop();
    await act(async () => {
      useAuthStore.setState({
        isAuthenticated: false,
        accessToken: null,
        refreshToken: null,
        deviceId: null,
        tokenExpiresAt: null,
      });
    });
    jest.restoreAllMocks();
  });

  function wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SyncProvider client={client}>{children}</SyncProvider>
      </QueryClientProvider>
    );
  }

  it("owns one client lifecycle for multiple consumers", async () => {
    const screen = await render(
      <>
        <CommandConsumer />
        <CommandConsumer />
      </>,
      { wrapper },
    );

    await waitFor(() => expect(createSocket).toHaveBeenCalledTimes(1));
    expect(socket.onmessage).toBeDefined();
    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("handles each incoming update once at the shared boundary", async () => {
    const invalidateQueries = jest.spyOn(queryClient, "invalidateQueries");
    const emit = jest.spyOn(DeviceEventEmitter, "emit");

    const screen = await render(<CommandConsumer />, { wrapper });

    await waitFor(() => expect(createSocket).toHaveBeenCalledTimes(1));
    expect(socket.onmessage).toBeDefined();
    socket.onmessage?.({
      data: JSON.stringify({
        event: "PROGRESS_UPDATE",
        data: { itemId: "item-1" },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        event: "REMOTE_COMMAND",
        data: { action: "pause" },
      }),
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("REMOTE_COMMAND", { action: "pause" });
    expect(emit).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });
});
