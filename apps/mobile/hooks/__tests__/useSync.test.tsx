import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import { SyncProvider } from "../../contexts/SyncContext";
import { useAuthStore } from "../../stores/authStore";
import { useSync } from "../useSync";

const ACCESS_TOKEN = "header.payload.signature";
const DEVICE_ID = "desktop-browser-test";

describe("useSync WebSocket transport", () => {
  const originalPlatform = Platform.OS;
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      credentialsHydrated: true,
      accessToken: ACCESS_TOKEN,
      refreshToken: "refresh-token",
      deviceId: DEVICE_ID,
      tokenExpiresAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(global, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
    useAuthStore.setState({
      isAuthenticated: false,
      credentialsHydrated: true,
      accessToken: null,
      refreshToken: null,
      deviceId: null,
      tokenExpiresAt: null,
    });
    jest.clearAllMocks();
  });

  function setupWebSocketMock() {
    const socket = {
      close: jest.fn(),
      readyState: 0,
      send: jest.fn(),
    };
    const WebSocketMock = jest.fn().mockImplementation(() => socket);
    Object.defineProperty(WebSocketMock, "OPEN", { value: 1 });
    Object.defineProperty(global, "WebSocket", {
      configurable: true,
      writable: true,
      value: WebSocketMock,
    });
    return { socket, WebSocketMock };
  }

  function wrapper({ children }: PropsWithChildren) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <SyncProvider>{children}</SyncProvider>
      </QueryClientProvider>
    );
  }

  it("uses bounded subprotocol credentials on browser and Electron renderers", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    const { WebSocketMock } = setupWebSocketMock();

    const { unmount } = await renderHook(() => useSync(), { wrapper });

    expect(WebSocketMock).toHaveBeenCalledWith(
      expect.stringMatching(/^wss?:\/\/.*\/api\/sync\/events$/),
      [
        "streamer-sync-v1",
        `streamer-auth.${ACCESS_TOKEN}`,
        `streamer-device.${DEVICE_ID}`,
      ],
    );
    expect(WebSocketMock.mock.calls[0]).toHaveLength(2);

    unmount();
  });

  it("preserves React Native Authorization and device headers", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });
    const { WebSocketMock } = setupWebSocketMock();

    const { unmount } = await renderHook(() => useSync(), { wrapper });

    expect(WebSocketMock).toHaveBeenCalledWith(expect.any(String), undefined, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "X-Device-Id": DEVICE_ID,
      },
    });

    unmount();
  });
});
