import { useEffect, useRef, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import { BASE_URL } from "../services/api";

/** Retry delays in ms: 2s, 5s, 15s */
const RETRY_DELAYS = [2_000, 5_000, 15_000];

const log = (...args: unknown[]) => {
  if (__DEV__) console.log("[Sync]", ...args);
};
const warn = (...args: unknown[]) => {
  if (__DEV__) console.warn("[Sync]", ...args);
};
const err = (...args: unknown[]) => {
  if (__DEV__) console.error("[Sync]", ...args);
};

/**
 * useSync establishes a persistent WebSocket connection to the backend
 * for real-time bi-directional synchronization.
 * Handles state updates from server and provides an interface to send events.
 */
export function useSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const deviceId = useAuthStore((s) => s.deviceId);
  const queryClient = useQueryClient();

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const closeWS = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  /** Send a message to the server */
  const sendMessage = useCallback((event: string, data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    } else {
      warn("Cannot send message: WebSocket is not open", event);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      clearRetryTimer();
      closeWS();
      retryCountRef.current = 0;
      return;
    }

    const connect = () => {
      closeWS();

      // Convert HTTP(S) to WS(S)
      const wsUrl = BASE_URL.replace(/^http/, "ws") + "/api/sync/events";

      log("Connecting to", wsUrl);

      // Note: standard WebSocket API doesn't support custom headers in all environments,
      // but React Native's WebSocket implementation DOES support them.
      // @ts-ignore: React Native WebSocket supports a 3rd argument for headers
      const ws = new WebSocket(wsUrl, undefined, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Device-Id": deviceId || "unknown",
        },
      });

      wsRef.current = ws;

      ws.onopen = () => {
        log("Connection opened");
        retryCountRef.current = 0;
      };

      ws.onmessage = (e) => {
        try {
          const { event: type, data } = JSON.parse(e.data);
          log("Event received:", type);

          switch (type) {
            case "ping":
              // Connection confirm or heartbeat
              break;

            case "LIBRARY_UPDATE":
              if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ["library"] });
                const itemId = data.itemId || data.item?.itemId;
                if (itemId) {
                  queryClient.invalidateQueries({
                    queryKey: ["library", "check", itemId],
                  });
                }
              }
              break;

            case "PROGRESS_UPDATE":
              if (queryClient) {
                queryClient.invalidateQueries({
                  queryKey: ["continue-watching"],
                });
              }
              break;

            case "SESSION_UPDATE":
              DeviceEventEmitter.emit("SESSION_UPDATE", data);
              break;

            case "REMOTE_COMMAND":
              DeviceEventEmitter.emit("REMOTE_COMMAND", data);
              break;

            case "playback_update":
              // Remote control payload from another device
              DeviceEventEmitter.emit("playback_update", data);
              break;

            default:
              log("Unknown event type:", type);
          }
        } catch (error) {
          err("Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (e: any) => {
        warn("Connection error:", e?.message || "Unknown error");
      };

      ws.onclose = (e) => {
        log("Connection closed:", e.code, e.reason);

        // Reconnect logic
        if (isAuthenticated && accessToken) {
          const delay =
            RETRY_DELAYS[
              Math.min(retryCountRef.current, RETRY_DELAYS.length - 1)
            ];
          retryCountRef.current += 1;
          log(
            `Reconnecting in ${delay / 1000}s (attempt ${retryCountRef.current})…`,
          );

          retryTimerRef.current = setTimeout(() => {
            if (connectRef.current) connectRef.current();
          }, delay);
        }
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      clearRetryTimer();
      closeWS();
      connectRef.current = null;
      retryCountRef.current = 0;
      log("Cleanup complete");
    };
  }, [isAuthenticated, accessToken, deviceId, queryClient]);

  return { sendMessage };
}
