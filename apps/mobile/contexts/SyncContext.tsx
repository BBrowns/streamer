import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from "react";
import { DeviceEventEmitter } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import {
  syncClient,
  type SyncClient,
  type SyncMessage,
} from "../services/syncClient";

type SyncContextValue = {
  sendMessage: (event: string, data: unknown) => void;
};

type SyncProviderProps = PropsWithChildren<{
  client?: SyncClient;
}>;

const SyncContext = createContext<SyncContextValue | null>(null);

function invalidateLibrary(queryClient: QueryClient, data: unknown): void {
  queryClient.invalidateQueries({ queryKey: ["library"] });

  if (!data || typeof data !== "object") return;
  const payload = data as {
    itemId?: unknown;
    item?: { itemId?: unknown };
  };
  const itemId = payload.itemId ?? payload.item?.itemId;
  if (typeof itemId === "string" && itemId) {
    queryClient.invalidateQueries({ queryKey: ["library", "check", itemId] });
  }
}

function handleSyncMessage(
  queryClient: QueryClient,
  message: SyncMessage,
): void {
  switch (message.event) {
    case "ping":
      return;
    case "LIBRARY_UPDATE":
      invalidateLibrary(queryClient, message.data);
      return;
    case "PROGRESS_UPDATE":
      queryClient.invalidateQueries({ queryKey: ["progress"] });
      return;
    case "SESSION_UPDATE":
    case "REMOTE_COMMAND":
    case "playback_update":
      DeviceEventEmitter.emit(message.event, message.data);
      return;
    default:
      return;
  }
}

export function SyncProvider({
  children,
  client = syncClient,
}: SyncProviderProps) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const deviceId = useAuthStore((state) => state.deviceId);

  useEffect(() => {
    const unsubscribe = client.subscribe((message) => {
      handleSyncMessage(queryClient, message);
    });
    client.start();

    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client, queryClient]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      client.stop();
      return;
    }
    client.updateAuth();
  }, [accessToken, client, deviceId, isAuthenticated]);

  const sendMessage = useCallback(
    (event: string, data: unknown) => client.sendMessage(event, data),
    [client],
  );
  const contextValue = useMemo(() => ({ sendMessage }), [sendMessage]);

  return (
    <SyncContext.Provider value={contextValue}>{children}</SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return context;
}
