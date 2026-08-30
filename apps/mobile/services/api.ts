import axios, { type AxiosRequestConfig } from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuthStore } from "../stores/authStore";
import { clientRuntimeConfig } from "./runtimeConfig";

type AuthRefreshState = {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
};

type RefreshableRequest = AxiosRequestConfig & {
  _retry?: boolean;
};

type AuthRefreshResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

function getAuthorizationHeader(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;

  const candidate = headers as {
    Authorization?: unknown;
    authorization?: unknown;
    get?: (name: string) => unknown;
  };
  const value =
    candidate.get?.("Authorization") ??
    candidate.Authorization ??
    candidate.authorization;

  return typeof value === "string" ? value : null;
}

/**
 * A 401 from a request without a bearer token is expected for public or
 * pre-authentication traffic. Refreshing it would turn a harmless rejection
 * into a refresh/logout loop, so only retry requests that were genuinely
 * authenticated when they were sent.
 */
export function shouldRefreshUnauthorizedRequest(
  request: RefreshableRequest | undefined,
  auth: AuthRefreshState,
): boolean {
  if (
    !request ||
    request._retry ||
    !auth.isAuthenticated ||
    !auth.accessToken ||
    !auth.refreshToken
  ) {
    return false;
  }

  return /^Bearer\s+\S+$/i.test(getAuthorizationHeader(request.headers) ?? "");
}

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
  if (clientRuntimeConfig.apiUrl) {
    return clientRuntimeConfig.apiUrl;
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

let refreshInFlight: Promise<string> | null = null;

/**
 * Refresh the app session once for all callers, including WebSocket and Axios
 * consumers. Refresh tokens rotate on the server, so concurrent refresh
 * requests must share the same promise.
 */
export function refreshAuthSession(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  let refreshPromise: Promise<string>;
  refreshPromise = Promise.resolve()
    .then(async () => {
      const { backendUrl, refreshToken } = useAuthStore.getState();
      if (!refreshToken) throw new Error("No refresh token");

      const targetUrl = backendUrl || BASE_URL;
      const { data } = await axios.post<AuthRefreshResponse>(
        `${targetUrl}/api/auth/refresh`,
        { refreshToken },
      );
      const expiresInMs = data.expiresIn ? data.expiresIn * 1000 : undefined;

      await useAuthStore
        .getState()
        .setTokens(data.accessToken, data.refreshToken, expiresInMs);
      return data.accessToken;
    })
    .catch(async (error) => {
      await useAuthStore.getState().logout();
      throw error;
    })
    .finally(() => {
      if (refreshInFlight === refreshPromise) refreshInFlight = null;
    });

  refreshInFlight = refreshPromise;
  return refreshPromise;
}

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RefreshableRequest | undefined;
    const auth = useAuthStore.getState();

    if (
      error.response?.status === 401 &&
      shouldRefreshUnauthorizedRequest(originalRequest, auth)
    ) {
      // The predicate above returns false without a request, but TypeScript
      // cannot infer that relationship across the helper boundary.
      if (!originalRequest) return Promise.reject(error);

      originalRequest._retry = true;

      try {
        const accessToken = await refreshAuthSession();
        const headers = originalRequest.headers as
          Record<string, unknown> | undefined;
        if (headers) headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  },
);
