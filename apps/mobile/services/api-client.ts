import { hc } from "hono/client";
import type { AppType } from "@streamer/server/src/app";
import { BASE_URL } from "./api";
import { useAuthStore } from "../stores/authStore";

/**
 * The typed Hono RPC client.
 * This provides end-to-end type safety for all documented routes.
 */
export const client = hc<AppType>(BASE_URL, {
  headers: () => {
    const { accessToken, deviceId } = useAuthStore.getState();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (deviceId) {
      headers["X-Device-Id"] = deviceId;
    }
    return headers;
  },
});

/**
 * Proxy function to handle dynamic backend URL from authStore.
 * Usage: api('http://custom-ip:3001').api.auth.login.$post(...)
 */
export const getApiClient = (customUrl?: string) => {
  const url = customUrl || useAuthStore.getState().backendUrl || BASE_URL;
  return hc<AppType>(url, {
    headers: () => {
      const { accessToken, deviceId } = useAuthStore.getState();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      if (deviceId) {
        headers["X-Device-Id"] = deviceId;
      }
      return headers;
    },
  });
};
