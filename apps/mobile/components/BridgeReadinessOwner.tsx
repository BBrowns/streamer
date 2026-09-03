import { useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useAuthStore } from "../stores/authStore";
import {
  startBridgeReadinessPolling,
  stopBridgeReadinessPolling,
} from "../services/streamEngine/bridgeReadinessRuntime";

function getDocumentVisible() {
  return Platform.OS !== "web" || typeof document === "undefined"
    ? true
    : document.visibilityState === "visible";
}

export function shouldPollBridgeReadiness({
  isHydrated,
  credentialsHydrated,
  isAuthenticated,
  appState,
  documentVisible,
}: {
  isHydrated: boolean;
  credentialsHydrated: boolean;
  isAuthenticated: boolean;
  appState: AppStateStatus;
  documentVisible: boolean;
}) {
  return (
    isHydrated &&
    credentialsHydrated &&
    isAuthenticated &&
    appState === "active" &&
    documentVisible
  );
}

/** Owns the only background bridge probe for the authenticated app shell. */
export function BridgeReadinessOwner() {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const credentialsHydrated = useAuthStore(
    (state) => state.credentialsHydrated,
  );
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const [documentVisible, setDocumentVisible] = useState(getDocumentVisible);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const canPoll = shouldPollBridgeReadiness({
    isHydrated,
    credentialsHydrated,
    isAuthenticated,
    appState,
    documentVisible,
  });

  useEffect(() => {
    if (!canPoll) {
      stopBridgeReadinessPolling();
      return;
    }

    startBridgeReadinessPolling();
    return stopBridgeReadinessPolling;
  }, [canPoll]);

  return null;
}
