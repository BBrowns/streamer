import { useEffect, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import SSE from "react-native-sse";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import { BASE_URL } from "../services/api";

/**
 * useSync hook establishes an SSE connection to the backend to receive
 * real-time updates for library changes and watch progress from other devices.
 */
export function useSync() {
  const { isAuthenticated, accessToken, deviceId } = useAuthStore();
  const queryClient = useQueryClient();
  const sseRef = useRef<SSE | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    // Initialize SSE connection
    const url = `${BASE_URL}/api/sync/events`;
    const sse = new SSE(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Device-Id": deviceId || "unknown",
      },
    });

    sseRef.current = sse;

    // Listen for library updates
    sse.addEventListener("LIBRARY_UPDATE" as any, (event: any) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[Sync] Library update received:", data);

        // Invalidate relevant queries to fetch fresh data
        queryClient.invalidateQueries({ queryKey: ["library"] });

        // If it's a specific item change, we could be more granular
        if (data.itemId) {
          queryClient.invalidateQueries({
            queryKey: ["library", "check", data.itemId],
          });
        }
      } catch (err) {
        console.error("[Sync] Failed to parse LIBRARY_UPDATE:", err);
      }
    });

    // Listen for watch progress updates
    sse.addEventListener("PROGRESS_UPDATE" as any, (event: any) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[Sync] Progress update received:", data.itemId);

        // Invalidate continue watching list
        queryClient.invalidateQueries({ queryKey: ["continue-watching"] });

        // Invalidate specific item progress if needed
        // but meistly we want the library/home screens to refresh
      } catch (err) {
        console.error("[Sync] Failed to parse PROGRESS_UPDATE:", err);
      }
    });

    // Listen for session updates (other devices status)
    sse.addEventListener("SESSION_UPDATE" as any, (event: any) => {
      try {
        const data = JSON.parse(event.data);
        DeviceEventEmitter.emit("SESSION_UPDATE", data);
      } catch (err) {
        console.error("[Sync] Failed to parse SESSION_UPDATE:", err);
      }
    });

    // Listen for remote commands (e.g. from another phone)
    sse.addEventListener("REMOTE_COMMAND" as any, (event: any) => {
      try {
        const data = JSON.parse(event.data);
        DeviceEventEmitter.emit("REMOTE_COMMAND", data);
      } catch (err) {
        console.error("[Sync] Failed to parse REMOTE_COMMAND:", err);
      }
    });

    sse.addEventListener("error", (event: any) => {
      if (event.type === "error") {
        console.warn("[Sync] SSE Connection Error:", event);
      }
    });

    sse.addEventListener("open", () => {
      console.log("[Sync] SSE Connection opened");
    });

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
        console.log("[Sync] SSE Connection closed");
      }
    };
  }, [isAuthenticated, accessToken, deviceId, queryClient]);
}
