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
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === "web") {
    return "http://localhost:3001";
  }

  // Native dev sessions: derive IP from the Metro bundler host Expo already
  // knows about. This works for iPhone and physical Android devices on LAN.
  const metroHost = Constants.expoConfig?.hostUri; // e.g. "10.109.106.55:8081"
  if (metroHost) {
    const ip = metroHost.split(":")[0]; // strip the Metro port
    return `http://${ip}:3001`;
  }

  if (Platform.OS === "android") {
    // Android emulator's special alias for the host machine
    return "http://10.0.2.2:3001";
  }

  // Standalone build fallback (no Metro host)
  return "http://localhost:3001";
}

export const BASE_URL = resolveBaseUrl();

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// Attach access token, device ID, and dynamic base URL to every request
api.interceptors.request.use((config) => {
  const { accessToken, deviceId, backendUrl } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (deviceId) {
    config.headers["X-Device-Id"] = deviceId;
  }
  if (backendUrl) {
    config.baseURL = backendUrl;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { backendUrl, refreshToken } = useAuthStore.getState();
        if (!refreshToken) throw new Error("No refresh token");

        const targetUrl = backendUrl || BASE_URL;
        const { data } = await axios.post(`${targetUrl}/api/auth/refresh`, {
          refreshToken,
        });

        // Pass expiresInMs so authStore can track proactive refresh timing
        const expiresInMs = data.expiresIn ? data.expiresIn * 1000 : undefined;

        useAuthStore
          .getState()
          .setTokens(data.accessToken, data.refreshToken, expiresInMs);

        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        useAuthStore.getState().logout();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
