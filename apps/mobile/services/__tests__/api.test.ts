import axios from "axios";
import { api, shouldRefreshUnauthorizedRequest } from "../api";
import { useAuthStore } from "../../stores/authStore";

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
});
