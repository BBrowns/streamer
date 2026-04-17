import { useEffect, useRef, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import SSE from "react-native-sse";
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
 * useSync establishes an SSE connection to the backend for real-time
 * library and progress updates. Reconnects automatically with
 * exponential backoff (2s → 5s → 15s) on connection loss.
 */
export function useSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const deviceId = useAuthStore((s) => s.deviceId);
  const queryClient = useQueryClient();

  const sseRef = useRef<SSE | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable reference to the connect function for retries
  const connectRef = useRef<(() => void) | null>(null);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const closeSSE = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      clearRetryTimer();
      closeSSE();
      retryCountRef.current = 0;
      return;
    }

    const connect = () => {
      closeSSE();

      const url = `${BASE_URL}/api/sync/events`;
      const sse = new SSE(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Device-Id": deviceId || "unknown",
        },
      });

      sseRef.current = sse;

      sse.addEventListener("open", () => {
        log("Connection opened");
        retryCountRef.current = 0; // Reset backoff on successful connect
      });

      sse.addEventListener("error", (event: any) => {
        warn("Connection error:", event?.message ?? event);
        closeSSE();

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
      });

      sse.addEventListener("LIBRARY_UPDATE" as any, (event: any) => {
        try {
          const data = JSON.parse(event.data);
          log("Library update:", data);
          if (queryClient) {
            queryClient.invalidateQueries({ queryKey: ["library"] });
            const itemId = data.itemId || data.item?.itemId;
            if (itemId) {
              queryClient.invalidateQueries({
                queryKey: ["library", "check", itemId],
              });
            }
          }
        } catch (e) {
          err("Failed to parse LIBRARY_UPDATE:", e);
        }
      });

      sse.addEventListener("PROGRESS_UPDATE" as any, (event: any) => {
        try {
          const data = JSON.parse(event.data);
          log("Progress update:", data.itemId);
          if (queryClient) {
            queryClient.invalidateQueries({ queryKey: ["continue-watching"] });
          }
        } catch (e) {
          err("Failed to parse PROGRESS_UPDATE:", e);
        }
      });

      sse.addEventListener("SESSION_UPDATE" as any, (event: any) => {
        try {
          DeviceEventEmitter.emit("SESSION_UPDATE", JSON.parse(event.data));
        } catch (e) {
          err("Failed to parse SESSION_UPDATE:", e);
        }
      });

      sse.addEventListener("REMOTE_COMMAND" as any, (event: any) => {
        try {
          DeviceEventEmitter.emit("REMOTE_COMMAND", JSON.parse(event.data));
        } catch (e) {
          err("Failed to parse REMOTE_COMMAND:", e);
        }
      });
    };

    // Store the connect function in a ref so the error handler can call it
    connectRef.current = connect;
    connect();

    return () => {
      clearRetryTimer();
      closeSSE();
      connectRef.current = null;
      retryCountRef.current = 0;
      log("Connection closed (cleanup)");
    };
  }, [isAuthenticated, accessToken, deviceId, queryClient]);
}
