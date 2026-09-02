import axios from "axios";
import {
  api,
  ensureFreshAuthSession,
  refreshAuthSession,
  shouldRefreshUnauthorizedRequest,
} from "../api";
import { useAuthStore } from "../../stores/authStore";
import { isRateLimitError } from "../rateLimit";

const authenticated = {
  isAuthenticated: true,
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

describe("shouldRefreshUnauthorizedRequest", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      credentialsHydrated: true,
      sessionHealth: "ready",
      sessionIssue: null,
      sessionRetryAt: null,
    });
  });

  it("does not refresh 401 responses from deliberately anonymous requests", () => {
    expect(
      shouldRefreshUnauthorizedRequest(
        { headers: { "Content-Type": "application/json" } },
        authenticated,
      ),
    ).toBe(false);
    expect(
      shouldRefreshUnauthorizedRequest(
        { headers: { Authorization: "Bearer access-token" } },
        { ...authenticated, isAuthenticated: false },
      ),
    ).toBe(false);
  });

  it("only refreshes one previously authenticated request", () => {
    const request = { headers: { Authorization: "Bearer access-token" } };

    expect(shouldRefreshUnauthorizedRequest(request, authenticated)).toBe(true);
    expect(
      shouldRefreshUnauthorizedRequest(
        { ...request, _retry: true },
        authenticated,
      ),
    ).toBe(false);
  });

  it("passes an anonymous 401 through without attempting a token refresh", async () => {
    const refresh = jest.spyOn(axios, "post");
    const error = {
      config: { headers: { "Content-Type": "application/json" } },
      response: { status: 401 },
    };
    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{ rejected?: (reason: unknown) => Promise<unknown> }>;
      }
    ).handlers.find((handler) => handler.rejected)?.rejected;

    if (!responseInterceptor) {
      throw new Error(
        "Expected the API 401 response interceptor to be installed",
      );
    }

    await expect(responseInterceptor(error)).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("turns 429 responses into a bounded cooldown without retrying", async () => {
    const error = {
      config: { headers: { "Content-Type": "application/json" } },
      response: { status: 429, headers: { "retry-after": "7" } },
    };
    const responseInterceptor = (
      api.interceptors.response as unknown as {
        handlers: Array<{
          rejected?: (reason: unknown) => Promise<unknown>;
        }>;
      }
    ).handlers.find((handler) => handler.rejected)?.rejected;

    if (!responseInterceptor) throw new Error("Expected response interceptor");

    let rejected: unknown;
    try {
      await responseInterceptor(error);
    } catch (value) {
      rejected = value;
    }
    expect(isRateLimitError(rejected)).toBe(true);
    expect((rejected as { retryAfterMs?: number }).retryAfterMs).toBe(7_000);
  });

  it("single-flights explicit session refreshes and stores rotated tokens", async () => {
    let resolveRefresh!: (value: unknown) => void;
    const refreshResponse = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = jest
      .spyOn(axios, "post")
      .mockReturnValue(refreshResponse as Promise<never>);

    const first = refreshAuthSession();
    const second = refreshAuthSession();

    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh({
      data: {
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      "rotated-access-token",
      "rotated-access-token",
    ]);
    expect(useAuthStore.getState().accessToken).toBe("rotated-access-token");
    expect(useAuthStore.getState().refreshToken).toBe("rotated-refresh-token");
  });

  it("refreshes an expired session before sending a protected request", async () => {
    useAuthStore.setState({
      credentialsHydrated: true,
      tokenExpiresAt: Date.now() - 1,
      deviceId: null,
      backendUrl: null,
    });
    jest.spyOn(axios, "post").mockResolvedValue({
      data: {
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
      },
    });

    const requestInterceptor = (
      api.interceptors.request as unknown as {
        handlers: Array<{
          fulfilled?: (config: unknown) => unknown;
        }>;
      }
    ).handlers.find((handler) => handler.fulfilled)?.fulfilled;

    if (!requestInterceptor) throw new Error("Expected request interceptor");

    const config = await requestInterceptor({ headers: {} });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(config).toMatchObject({
      headers: { Authorization: "Bearer rotated-access-token" },
    });
  });

  it("does not retry auth refresh while Retry-After cooldown is active", async () => {
    useAuthStore.setState({
      tokenExpiresAt: Date.now() - 1,
      sessionHealth: "degraded",
      sessionIssue: "rate-limited",
      sessionRetryAt: Date.now() + 7_000,
    });
    const refresh = jest.spyOn(axios, "post");

    await expect(ensureFreshAuthSession()).rejects.toMatchObject({
      kind: "rate-limited",
      retryAfterMs: expect.any(Number),
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("logs out when the refresh token is rejected", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      response: { status: 401, data: { code: "REFRESH_REVOKED" } },
    });

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "invalid-credentials",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("keeps the session when refresh has no server response", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      request: {},
      code: "ERR_NETWORK",
    });

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "network",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("access-token");
    expect(useAuthStore.getState().refreshToken).toBe("refresh-token");
    expect(useAuthStore.getState().sessionHealth).toBe("degraded");
  });

  it("keeps the session and exposes Retry-After for refresh rate limits", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      response: { status: 429, headers: { "retry-after": "7" } },
    });

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "rate-limited",
      retryAfterMs: 7_000,
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().sessionHealth).toBe("degraded");
  });

  it("keeps the session when the auth service is temporarily unavailable", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      response: { status: 503, headers: { "retry-after": "5" } },
    });

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "temporarily-unavailable",
      retryAfterMs: 5_000,
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().sessionHealth).toBe("degraded");
  });

  it("uses a bounded timeout for the one-time refresh request", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      code: "ECONNABORTED",
      request: {},
    });

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      { refreshToken: "refresh-token" },
      { timeout: 10_000 },
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("does not log out when rotated token persistence fails", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      data: {
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
      },
    });
    jest
      .spyOn(useAuthStore.getState(), "setTokens")
      .mockRejectedValue(new Error("storage unavailable"));

    await expect(refreshAuthSession()).rejects.toMatchObject({
      kind: "storage",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().sessionHealth).toBe("needs-attention");
  });
});
