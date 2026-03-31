/**
 * authStore.ts
 *
 * Zustand store for authentication state with a two-tier persistence strategy:
 *
 *  TIER 1 — SecureStore (sensitive, hardware-backed on iOS/Android):
 *    accessToken, refreshToken, tokenExpiresAt
 *
 *  TIER 2 — AsyncStorage (non-sensitive, Zustand `persist` middleware):
 *    user profile, deviceId, isAuthenticated
 *
 * On web, SecureStore falls back to AsyncStorage automatically (see secureStorage.ts).
 * Tokens are never written into the Zustand `persist` blob, so they never appear
 * in plain AsyncStorage.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProfile } from "@streamer/shared";
import { secureStorage, SECURE_KEYS } from "../services/secureStorage";

interface AuthState {
  // ── Non-sensitive (AsyncStorage via Zustand persist) ──────────────────────
  user: UserProfile | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  biometricEnabled: boolean;
  backendUrl: string | null;
  streamServerUrl: string | null;
  theme: "light" | "dark" | "system";

  // ── Sensitive (SecureStore — NOT part of the Zustand persist blob) ────────
  // These are kept in component state only; SecureStore is the source of truth.
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setAuth: (
    user: UserProfile,
    accessToken: string,
    refreshToken: string,
    expiresInMs?: number,
  ) => Promise<void>;
  setTokens: (
    accessToken: string,
    refreshToken: string,
    expiresInMs?: number,
  ) => Promise<void>;
  loadTokensFromSecureStore: () => Promise<void>;
  setDeviceId: (id: string) => void;
  setHydrated: (hydrated: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setServerUrls: (
    backend?: string | null,
    streamServer?: string | null,
  ) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  logout: () => Promise<void>;
  isTokenExpired: () => boolean;
}

const DEFAULT_TOKEN_EXPIRY_MS = 14 * 60 * 1000; // 14 minutes

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // ── Initial state ────────────────────────────────────────────────────
      user: null,
      deviceId: null,
      isAuthenticated: false,
      isHydrated: false,
      biometricEnabled: false,
      backendUrl: null,
      streamServerUrl: null,
      theme: "system",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,

      // ── setAuth — called after login / register ──────────────────────────
      setAuth: async (user, accessToken, refreshToken, expiresInMs) => {
        const expiresAt = Date.now() + (expiresInMs ?? DEFAULT_TOKEN_EXPIRY_MS);

        // Mirror tokens into in-memory state for synchronous reads (api.ts interceptor) and instant UI updates
        set({
          user,
          isAuthenticated: true,
          accessToken,
          refreshToken,
          tokenExpiresAt: expiresAt,
        });

        // Write sensitive values to SecureStore in the background
        await Promise.all([
          secureStorage.setItem(SECURE_KEYS.ACCESS_TOKEN, accessToken),
          secureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
          secureStorage.setItem(
            SECURE_KEYS.TOKEN_EXPIRES_AT,
            String(expiresAt),
          ),
        ]);
      },

      // ── setTokens — called after token refresh ───────────────────────────
      setTokens: async (accessToken, refreshToken, expiresInMs) => {
        const expiresAt = Date.now() + (expiresInMs ?? DEFAULT_TOKEN_EXPIRY_MS);

        set({ accessToken, refreshToken, tokenExpiresAt: expiresAt });

        await Promise.all([
          secureStorage.setItem(SECURE_KEYS.ACCESS_TOKEN, accessToken),
          secureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
          secureStorage.setItem(
            SECURE_KEYS.TOKEN_EXPIRES_AT,
            String(expiresAt),
          ),
        ]);
      },

      // ── loadTokensFromSecureStore — called at app boot ───────────────────
      // Hydrates the in-memory token values from SecureStore after persisted
      // non-sensitive state (user, isAuthenticated) has been rehydrated.
      loadTokensFromSecureStore: async () => {
        const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
          secureStorage.getItem(SECURE_KEYS.ACCESS_TOKEN),
          secureStorage.getItem(SECURE_KEYS.REFRESH_TOKEN),
          secureStorage.getItem(SECURE_KEYS.TOKEN_EXPIRES_AT),
        ]);

        const tokenExpiresAt = expiresAtStr ? Number(expiresAtStr) : null;

        set({ accessToken, refreshToken, tokenExpiresAt });
      },

      // ── setDeviceId ──────────────────────────────────────────────────────
      setDeviceId: (id) => set({ deviceId: id }),

      // ── setHydrated ──────────────────────────────────────────────────────
      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      // ── setBiometricEnabled ──────────────────────────────────────────────
      setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),

      // ── setServerUrls ────────────────────────────────────────────────────
      setServerUrls: (backend, streamServer) =>
        set({
          backendUrl: backend ?? null,
          streamServerUrl: streamServer ?? null,
        }),

      // ── setTheme ─────────────────────────────────────────────────────────
      setTheme: (theme) => set({ theme }),

      // ── logout ───────────────────────────────────────────────────────────
      logout: async () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isAuthenticated: false,
        });
        await secureStorage.clearTokens();
      },

      // ── isTokenExpired ───────────────────────────────────────────────────
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
      // ⚠️  Tokens are intentionally EXCLUDED from this blob.
      // They live in SecureStore and are loaded separately via
      // loadTokensFromSecureStore() called in _layout.tsx.
      partialize: (state) => ({
        user: state.user,
        deviceId: state.deviceId,
        isAuthenticated: state.isAuthenticated,
        biometricEnabled: state.biometricEnabled,
        backendUrl: state.backendUrl,
        streamServerUrl: state.streamServerUrl,
        theme: state.theme,
      }),
    },
  ),
);
