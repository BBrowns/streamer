import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, DeviceEventEmitter, Platform } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import {
  syncClient,
  type SyncClient,
  type SyncMessage,
  type SyncStatusSnapshot,
} from "../services/syncClient";

type SyncContextValue = {
  sendMessage: (event: string, data: unknown) => void;
  retry: () => void;
  status: SyncStatusSnapshot;
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
  const [status, setStatus] = useState<SyncStatusSnapshot>(() =>
    client.getStatus(),
  );
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const credentialsHydrated = useAuthStore(
    (state) => state.credentialsHydrated,
  );
  const accessToken = useAuthStore((state) => state.accessToken);
  const deviceId = useAuthStore((state) => state.deviceId);

  useEffect(() => {
    setStatus(client.getStatus());
    return client.subscribeStatus(setStatus);
  }, [client]);

  useEffect(() => {
    const getCurrentAppState = () => {
      const currentState = AppState.currentState;
      return typeof currentState === "string" ? currentState : "active";
    };
    const isDocumentVisible = () =>
      Platform.OS !== "web" ||
      typeof document === "undefined" ||
      document.visibilityState !== "hidden";
    const isAppActive = () =>
      (getCurrentAppState() === "active" ||
        getCurrentAppState() === "unknown") &&
      isDocumentVisible();
    const updateActivity = () => client.setActive(isAppActive());
    const appStateSubscription = AppState.addEventListener(
      "change",
      updateActivity,
    );

    updateActivity();

    if (Platform.OS !== "web" || typeof document === "undefined") {
      return () => appStateSubscription.remove();
    }

    document.addEventListener("visibilitychange", updateActivity);
    return () => {
      appStateSubscription.remove();
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, [client]);

  useEffect(() => {
    if (!credentialsHydrated) {
      client.stop();
      return;
    }

    const unsubscribe = client.subscribe((message) => {
      handleSyncMessage(queryClient, message);
    });
    client.start();

    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client, credentialsHydrated, queryClient]);

  useEffect(() => {
    if (!credentialsHydrated || !isAuthenticated || !accessToken) {
      client.stop();
      return;
    }
    client.updateAuth();
  }, [accessToken, client, credentialsHydrated, deviceId, isAuthenticated]);

  const sendMessage = useCallback(
    (event: string, data: unknown) => client.sendMessage(event, data),
    [client],
  );
  const retry = useCallback(() => client.retryNow(), [client]);
  const contextValue = useMemo(
    () => ({ sendMessage, retry, status }),
    [retry, sendMessage, status],
  );

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
