import axios, { type AxiosRequestConfig } from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuthStore } from "../stores/authStore";
import { clientRuntimeConfig } from "./runtimeConfig";
import { parseRetryAfterMs, toRateLimitError } from "./rateLimit";

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

export type AuthRefreshFailureKind =
  | "invalid-credentials"
  | "rate-limited"
  | "temporarily-unavailable"
  | "network"
  | "timeout"
  | "storage"
  | "unknown";

export class AuthRefreshError extends Error {
  readonly name = "AuthRefreshError";
  readonly kind: AuthRefreshFailureKind;
  readonly retryAfterMs: number | null;
  readonly status: number | null;

  constructor(
    kind: AuthRefreshFailureKind,
    options: { retryAfterMs?: number | null; status?: number | null } = {},
  ) {
    super(`Authentication refresh failed: ${kind}`);
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
  }
}

export function isAuthRefreshError(error: unknown): error is AuthRefreshError {
  return error instanceof AuthRefreshError;
}

const AUTH_REFRESH_TIMEOUT_MS = 10_000;

function getResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function getResponseHeaders(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return undefined;
  return (response as { headers?: unknown }).headers;
}

function getRetryAfterValue(headers: unknown): unknown {
  if (!headers || typeof headers !== "object") return undefined;
  const candidate = headers as {
    get?: (name: string) => unknown;
    [key: string]: unknown;
  };
  return (
    candidate.get?.("Retry-After") ??
    candidate.get?.("retry-after") ??
    candidate["Retry-After"] ??
    candidate["retry-after"]
  );
}

function classifyAuthRefreshFailure(error: unknown): AuthRefreshError {
  if (isAuthRefreshError(error)) return error;

  const rateLimitError = toRateLimitError(error);
  if (rateLimitError) {
    return new AuthRefreshError("rate-limited", {
      retryAfterMs: rateLimitError.retryAfterMs,
      status: 429,
    });
  }

  const status = getResponseStatus(error);
  if (status === 401) {
    return new AuthRefreshError("invalid-credentials", { status });
  }

  if (status === 503) {
    return new AuthRefreshError("temporarily-unavailable", {
      retryAfterMs: parseRetryAfterMs(
        getRetryAfterValue(getResponseHeaders(error)),
      ),
      status,
    });
  }

  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    const name = (error as { name?: unknown }).name;
    if (
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT" ||
      name === "AbortError"
    ) {
      return new AuthRefreshError("timeout");
    }
  }

  if (!status) {
    return new AuthRefreshError("network");
  }

  return new AuthRefreshError("unknown", { status });
}

function markRefreshHealth(error: AuthRefreshError): void {
  const store = useAuthStore.getState();
  if (error.kind === "invalid-credentials") {
    store.setSessionHealth("invalid");
    return;
  }

  const health = error.kind === "storage" ? "needs-attention" : "degraded";
  const issue = error.kind;
  const retryAt = error.retryAfterMs ? Date.now() + error.retryAfterMs : null;
  store.setSessionHealth(health, issue, retryAt);
}

function logRefreshFailure(error: AuthRefreshError): void {
  if (!__DEV__) return;
  console.warn("[Auth] Session refresh failed", {
    kind: error.kind,
    status: error.status,
    retryAfterMs: error.retryAfterMs,
  });
}

function getActiveRefreshCooldown(): AuthRefreshError | null {
  const { sessionIssue, sessionRetryAt } = useAuthStore.getState();
  if (
    (sessionIssue !== "rate-limited" &&
      sessionIssue !== "temporarily-unavailable") ||
    !sessionRetryAt ||
    sessionRetryAt <= Date.now()
  ) {
    return null;
  }

  return new AuthRefreshError(sessionIssue, {
    retryAfterMs: sessionRetryAt - Date.now(),
    status: sessionIssue === "rate-limited" ? 429 : 503,
  });
}

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

let refreshInFlight: Promise<string> | null = null;

/**
 * Ensure persisted sessions are refreshed before a protected request leaves
 * the renderer. The response interceptor remains as a safety net for tokens
 * that expire between this check and the server receiving the request.
 */
export async function ensureFreshAuthSession(): Promise<void> {
  const state = useAuthStore.getState();
  if (
    !state.credentialsHydrated ||
    !state.isAuthenticated ||
    !state.accessToken ||
    !state.refreshToken ||
    !state.isTokenExpired()
  ) {
    return;
  }

  const cooldown = getActiveRefreshCooldown();
  if (cooldown) throw cooldown;

  await refreshAuthSession();
}

// Attach access token, device ID, and dynamic base URL to every request
api.interceptors.request.use(async (config) => {
  await ensureFreshAuthSession();

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

/**
 * Refresh the app session once for all callers, including WebSocket and Axios
 * consumers. Refresh tokens rotate on the server, so concurrent refresh
 * requests must share the same promise.
 */
export function refreshAuthSession(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  const cooldown = getActiveRefreshCooldown();
  if (cooldown) return Promise.reject(cooldown);

  let refreshPromise: Promise<string>;
  refreshPromise = Promise.resolve()
    .then(async () => {
      const { backendUrl, refreshToken } = useAuthStore.getState();
      if (!refreshToken) {
        throw new AuthRefreshError("invalid-credentials", { status: 401 });
      }

      const targetUrl = backendUrl || BASE_URL;
      let data: AuthRefreshResponse;
      try {
        const response = await axios.post<AuthRefreshResponse>(
          `${targetUrl}/api/auth/refresh`,
          { refreshToken },
          { timeout: AUTH_REFRESH_TIMEOUT_MS },
        );
        data = response.data;
      } catch (error) {
        throw classifyAuthRefreshFailure(error);
      }

      const expiresInMs = data.expiresIn ? data.expiresIn * 1000 : undefined;

      try {
        await useAuthStore
          .getState()
          .setTokens(data.accessToken, data.refreshToken, expiresInMs);
      } catch {
        throw new AuthRefreshError("storage");
      }

      return data.accessToken;
    })
    .catch(async (error) => {
      const classified = classifyAuthRefreshFailure(error);
      logRefreshFailure(classified);
      markRefreshHealth(classified);
      if (classified.kind === "invalid-credentials") {
        await useAuthStore.getState().logout();
      }
      throw classified;
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
    const rateLimitError = toRateLimitError(error);
    if (rateLimitError) return Promise.reject(rateLimitError);

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
