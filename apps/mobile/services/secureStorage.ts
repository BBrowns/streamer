/**
 * secureStorage.ts
 *
 * Platform-aware storage abstraction:
 *  - iOS/Android → expo-secure-store (hardware-backed on supported devices)
 *  - Web         → AsyncStorage (same as before — no native hardware available)
 *
 * Use this ONLY for sensitive values (tokens).
 * Use AsyncStorage directly for non-sensitive preferences.
 *
 * Migration helper:
 *  migrateFromAsyncStorage() must be called once at app boot (in _layout.tsx)
 *  to move legacy token keys from plain AsyncStorage into SecureStore.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Lazy-load SecureStore to avoid web crashes --------------------------------
let _SecureStore: typeof import("expo-secure-store") | null = null;

async function getSecureStore() {
  if (Platform.OS === "web") return null;
  if (!_SecureStore) {
    _SecureStore = await import("expo-secure-store");
  }
  return _SecureStore;
}

// Keys that were previously stored in plain AsyncStorage and must be migrated
const LEGACY_AUTH_KEY = "auth-storage";

// Individual keys we persist to SecureStore (not the whole Zustand blob)
export const SECURE_KEYS = {
  ACCESS_TOKEN: "streamer.accessToken",
  REFRESH_TOKEN: "streamer.refreshToken",
  TOKEN_EXPIRES_AT: "streamer.tokenExpiresAt",
} as const;

type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

// --- Core API -----------------------------------------------------------------

export const secureStorage = {
  async getItem(key: SecureKey): Promise<string | null> {
    const store = await getSecureStore();
    if (!store) return AsyncStorage.getItem(key);
    return store.getItemAsync(key);
  },

  async setItem(key: SecureKey, value: string): Promise<void> {
    const store = await getSecureStore();
    if (!store) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await store.setItemAsync(key, value);
  },

  async removeItem(key: SecureKey): Promise<void> {
    const store = await getSecureStore();
    if (!store) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await store.deleteItemAsync(key);
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      secureStorage.removeItem(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.removeItem(SECURE_KEYS.REFRESH_TOKEN),
      secureStorage.removeItem(SECURE_KEYS.TOKEN_EXPIRES_AT),
    ]);
  },
};

// --- One-time migration -------------------------------------------------------

let _migrationRan = false;

/**
 * Migrate legacy tokens from the old plain-AsyncStorage Zustand blob into
 * individual SecureStore entries. Safe to call on every boot — idempotent.
 */
export async function migrateTokensToSecureStorage(): Promise<void> {
  if (_migrationRan || Platform.OS === "web") return;
  _migrationRan = true;

  try {
    const raw = await AsyncStorage.getItem(LEGACY_AUTH_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as {
      state?: {
        accessToken?: string;
        refreshToken?: string;
        tokenExpiresAt?: number;
      };
    };

    const state = parsed?.state;
    if (!state) return;

    const migrations: Promise<void>[] = [];

    if (state.accessToken) {
      migrations.push(
        secureStorage.setItem(SECURE_KEYS.ACCESS_TOKEN, state.accessToken),
      );
    }
    if (state.refreshToken) {
      migrations.push(
        secureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, state.refreshToken),
      );
    }
    if (state.tokenExpiresAt != null) {
      migrations.push(
        secureStorage.setItem(
          SECURE_KEYS.TOKEN_EXPIRES_AT,
          String(state.tokenExpiresAt),
        ),
      );
    }

    await Promise.all(migrations);

    // Scrub tokens from the plain AsyncStorage blob so they aren't duplicated
    const scrubbed = {
      ...parsed,
      state: {
        ...state,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      },
    };
    await AsyncStorage.setItem(LEGACY_AUTH_KEY, JSON.stringify(scrubbed));
  } catch {
    // Non-fatal — app still works, tokens will be read from the old store
    // until the user logs in again.
  }
}
