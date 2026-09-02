import { SECURE_KEYS, secureStorage } from "../../services/secureStorage";
import { useAuthStore } from "../authStore";

jest.mock("../../services/secureStorage", () => ({
  SECURE_KEYS: {
    ACCESS_TOKEN: "streamer.accessToken",
    REFRESH_TOKEN: "streamer.refreshToken",
    TOKEN_EXPIRES_AT: "streamer.tokenExpiresAt",
    STREAM_SERVER_TOKEN: "streamer.streamServerToken",
  },
  secureStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clearTokens: jest.fn(),
  },
}));

const getItem = secureStorage.getItem as jest.MockedFunction<
  typeof secureStorage.getItem
>;

describe("auth credential hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isHydrated: true,
      credentialsHydrated: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      streamServerToken: null,
    });
  });

  it("loads secure credentials before reporting the runtime ready", async () => {
    getItem.mockImplementation(async (key) => {
      if (key === SECURE_KEYS.ACCESS_TOKEN) return "access-token";
      if (key === SECURE_KEYS.REFRESH_TOKEN) return "refresh-token";
      if (key === SECURE_KEYS.TOKEN_EXPIRES_AT) return "1893456000000";
      if (key === SECURE_KEYS.STREAM_SERVER_TOKEN) return "pairing-token";
      return null;
    });

    await useAuthStore.getState().loadTokensFromSecureStore();

    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenExpiresAt: 1893456000000,
        streamServerToken: "pairing-token",
        credentialsHydrated: true,
      }),
    );
  });

  it("fails closed and still releases startup when secure storage fails", async () => {
    getItem.mockRejectedValue(new Error("keychain unavailable"));
    useAuthStore.setState({
      user: {
        id: "user-1",
        email: "viewer@example.test",
        displayName: "Viewer",
        createdAt: "2026-01-01T00:00:00.000Z",
        emailVerified: true,
      },
      isAuthenticated: true,
    });

    await expect(
      useAuthStore.getState().loadTokensFromSecureStore(),
    ).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({
        user: null,
        isAuthenticated: false,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        streamServerToken: null,
        credentialsHydrated: true,
      }),
    );
  });
});
