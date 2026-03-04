import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuthStore } from "../stores/authStore";

/**
 * Resolve the backend URL dynamically so the app works on both the iOS
 * Simulator and a real device over Wi-Fi without any manual IP changes.
 *
 * During Expo Go / dev-client sessions, `hostUri` is the IP:port Metro is
 * running on (e.g. "10.109.106.55:8081"). We reuse that IP with port 3001.
 *
 * For production standalone builds there is no Metro host, so we fall back to
 * the EXPO_PUBLIC_API_URL env var (or localhost for web).
 */
function resolveBaseUrl(): string {
  if (Platform.OS === "web") {
    return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
  }

  if (Platform.OS === "android") {
    // Android emulator's special alias for the host machine
    return process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3001";
  }

  // iOS: derive IP from the Metro bundler host Expo already knows about
  const metroHost = Constants.expoConfig?.hostUri; // e.g. "10.109.106.55:8081"
  if (metroHost) {
    const ip = metroHost.split(":")[0]; // strip the Metro port
    return `http://${ip}:3001`;
  }

  // Standalone build fallback (no Metro host)
  return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
}

const BASE_URL = resolveBaseUrl();

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refreshToken,
        });

        // Pass expiresInMs so authStore can track proactive refresh timing
        const expiresInMs = data.expiresIn ? data.expiresIn * 1000 : undefined;

        useAuthStore
          .getState()
          .setTokens(data.accessToken, data.refreshToken, expiresInMs);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
