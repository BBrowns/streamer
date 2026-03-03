import axios from "axios";
import { Platform } from "react-native";
import { useAuthStore } from "../stores/authStore";

const BASE_URL = Platform.select({
  web: "http://localhost:3001",
  default: "http://10.0.2.2:3001", // Android emulator → host
  ios: "http://localhost:3001",
});

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
