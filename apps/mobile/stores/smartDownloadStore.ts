import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./authStore";

export type SmartDownloadQuality = "best" | "1080p" | "720p" | "480p";

export interface SmartDownloadPreferences {
  enabled: boolean;
  autoDownloadNextEpisode: boolean;
  autoDeleteWatched: boolean;
  wifiOnly: boolean;
  storageLimitGb: number;
  quality: SmartDownloadQuality;
}

export type SmartNextEpisodePlanStatus =
  | "planned"
  | "queued"
  | "downloaded"
  | "blocked"
  | "skipped";

export interface SmartNextEpisodePlan {
  seriesId: string;
  title?: string;
  season: number;
  episode: number;
  episodeTitle?: string;
  status: SmartNextEpisodePlanStatus;
  reason?: string;
  updatedAt?: string;
}

export interface SmartDownloadState {
  preferences: SmartDownloadPreferences;
  nextEpisodePlans: Record<string, SmartNextEpisodePlan>;
  updatePreferences: (patch: Partial<SmartDownloadPreferences>) => void;
  planNextEpisode: (plan: SmartNextEpisodePlan) => void;
  removeNextEpisodePlan: (seriesId: string) => void;
  getNextEpisodePlan: (seriesId: string) => SmartNextEpisodePlan | null;
  resetSmartDownloads: () => void;
}

export const DEFAULT_SMART_DOWNLOAD_PREFERENCES: SmartDownloadPreferences = {
  enabled: false,
  autoDownloadNextEpisode: false,
  autoDeleteWatched: false,
  wifiOnly: true,
  storageLimitGb: 10,
  quality: "best",
};

export const SMART_DOWNLOAD_STORE_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function clampStorageLimitGb(value: number | undefined) {
  if (!Number.isFinite(value))
    return DEFAULT_SMART_DOWNLOAD_PREFERENCES.storageLimitGb;
  return Math.min(500, Math.max(1, Math.round(value || 1)));
}

function normalizePreferences(
  preferences?: Partial<SmartDownloadPreferences>,
): SmartDownloadPreferences {
  return {
    ...DEFAULT_SMART_DOWNLOAD_PREFERENCES,
    ...preferences,
    storageLimitGb: clampStorageLimitGb(preferences?.storageLimitGb),
  };
}

export function sanitizeSmartDownloadState(
  state: Partial<SmartDownloadState>,
): Pick<SmartDownloadState, "preferences" | "nextEpisodePlans"> {
  const preferences = normalizePreferences(state.preferences);
  return {
    preferences,
    nextEpisodePlans: preferences.enabled ? state.nextEpisodePlans || {} : {},
  };
}

export const useSmartDownloadStore = create<SmartDownloadState>()(
  persist(
    (set, get) => ({
      preferences: DEFAULT_SMART_DOWNLOAD_PREFERENCES,
      nextEpisodePlans: {},
      updatePreferences: (patch) =>
        set((state) => {
          const preferences = normalizePreferences({
            ...state.preferences,
            ...patch,
          });
          return {
            preferences,
            nextEpisodePlans: preferences.enabled ? state.nextEpisodePlans : {},
          };
        }),
      planNextEpisode: (plan) =>
        set((state) => {
          if (
            !state.preferences.enabled ||
            !state.preferences.autoDownloadNextEpisode
          ) {
            return state;
          }
          return {
            nextEpisodePlans: {
              ...state.nextEpisodePlans,
              [plan.seriesId]: {
                ...plan,
                updatedAt: nowIso(),
              },
            },
          };
        }),
      removeNextEpisodePlan: (seriesId) =>
        set((state) => {
          const nextEpisodePlans = { ...state.nextEpisodePlans };
          delete nextEpisodePlans[seriesId];
          return { nextEpisodePlans };
        }),
      getNextEpisodePlan: (seriesId) =>
        get().nextEpisodePlans[seriesId] || null,
      resetSmartDownloads: () =>
        set({
          preferences: DEFAULT_SMART_DOWNLOAD_PREFERENCES,
          nextEpisodePlans: {},
        }),
    }),
    {
      name: "smart-download-storage",
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          const deviceId = useAuthStore.getState().deviceId || "default";
          return AsyncStorage.getItem(`${name}-${deviceId}`);
        },
        setItem: async (name, value) => {
          const deviceId = useAuthStore.getState().deviceId || "default";
          return AsyncStorage.setItem(`${name}-${deviceId}`, value);
        },
        removeItem: async (name) => {
          const deviceId = useAuthStore.getState().deviceId || "default";
          return AsyncStorage.removeItem(`${name}-${deviceId}`);
        },
      })),
      version: SMART_DOWNLOAD_STORE_VERSION,
      migrate: (persistedState) =>
        sanitizeSmartDownloadState(
          (persistedState || {}) as Partial<SmartDownloadState>,
        ),
      partialize: (state) => sanitizeSmartDownloadState(state),
    },
  ),
);
