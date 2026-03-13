import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProfile } from "@streamer/shared";

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;

  setAuth: (
    user: UserProfile,
    accessToken: string,
    refreshToken: string,
    expiresInMs?: number,
  ) => void;
  setTokens: (
    accessToken: string,
    refreshToken: string,
    expiresInMs?: number,
  ) => void;
  setDeviceId: (id: string) => void;
  setHydrated: (hydrated: boolean) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
}

const DEFAULT_TOKEN_EXPIRY_MS = 14 * 60 * 1000; // 14 minutes

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      deviceId: null,
      isAuthenticated: false,
      isHydrated: false,

      setAuth: (user, accessToken, refreshToken, expiresInMs) =>
        set({
          user,
          accessToken,
          refreshToken,
          tokenExpiresAt: Date.now() + (expiresInMs ?? DEFAULT_TOKEN_EXPIRY_MS),
          isAuthenticated: true,
        }),

      setTokens: (accessToken, refreshToken, expiresInMs) =>
        set({
          accessToken,
          refreshToken,
          tokenExpiresAt: Date.now() + (expiresInMs ?? DEFAULT_TOKEN_EXPIRY_MS),
        }),

      setDeviceId: (id) => set({ deviceId: id }),

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isAuthenticated: false,
        }),

      isTokenExpired: () => {
        const { tokenExpiresAt } = get();
        if (!tokenExpiresAt) return true;
        return Date.now() >= tokenExpiresAt;
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
        isAuthenticated: state.isAuthenticated,
        deviceId: state.deviceId,
      }),
    },
  ),
);
