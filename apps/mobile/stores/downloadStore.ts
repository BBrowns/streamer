import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaInfo } from "./playerStore";
import { useAuthStore } from "./authStore";

export interface DownloadMediaItem extends MediaInfo {
  // Persisted only so an interrupted queue item can be retried.
  downloadUrl: string;
  sourceId?: string;
}

export interface DownloadPlaybackSessionContext {
  sessionId: string;
  candidateId: string;
  attemptId: string;
}

export type DownloadStatus =
  | "Pending"
  | "Preparing"
  | "Downloading"
  | "Verifying"
  | "Completed"
  | "Error"
  | "Paused";

export interface DownloadTask {
  id: string; // unique ID, e.g., the media stream URL or a UUID
  mediaInfo: DownloadMediaItem;
  localUri?: string; // final local file path
  resumeData?: string;
  progress: number; // 0 to 1
  status: DownloadStatus;
  error?: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  playbackSession?: DownloadPlaybackSessionContext;
  createdAt: string;
  updatedAt: string;
  offlineVerifiedAt?: string;
  originalStream?: import("@streamer/shared").Stream;
}

export interface DownloadState {
  tasks: Record<string, DownloadTask>;
  addTask: (
    id: string,
    mediaInfo: DownloadMediaItem,
    playbackSession?: DownloadPlaybackSessionContext,
    originalStream?: import("@streamer/shared").Stream,
  ) => void;
  updateProgress: (
    id: string,
    progress: number,
    totalBytesWritten: number,
    totalBytesExpectedToWrite: number,
  ) => void;
  setStatus: (
    id: string,
    status: DownloadStatus,
    localUri?: string,
    error?: string,
    resumeData?: string,
  ) => void;
  removeTask: (id: string) => void;
  isDownloaded: (id: string) => boolean;
  clearAll: () => void;
  setResumeData: (id: string, data: string) => void;
  setDownloadUrl: (id: string, downloadUrl: string) => void;
  markVerified: (id: string, localUri: string) => void;
  markFileMissing: (id: string, error: string) => void;
}

export const DOWNLOAD_STORE_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

export function isTaskOfflinePlayable(task?: DownloadTask | null) {
  return Boolean(
    task?.status === "Completed" &&
    task.localUri &&
    task.offlineVerifiedAt &&
    task.localUri.length > 5,
  );
}

export function migrateDownloadTasks(
  persistedState: unknown,
  persistedVersion = 0,
): Partial<DownloadState> | undefined {
  if (!persistedState || typeof persistedState !== "object") return undefined;

  const state = persistedState as Partial<DownloadState>;
  const persistedTasks =
    state.tasks && typeof state.tasks === "object" ? state.tasks : {};
  const migratedAt = nowIso();
  const tasks: Record<string, DownloadTask> = {};

  for (const [id, rawTask] of Object.entries(persistedTasks)) {
    if (!rawTask || typeof rawTask !== "object") continue;
    const task = rawTask as DownloadTask;
    if (!task.mediaInfo || typeof task.mediaInfo !== "object") continue;

    tasks[id] = {
      ...task,
      id,
      createdAt: task.createdAt || migratedAt,
      updatedAt: task.updatedAt || migratedAt,
      // Existing completed tasks predate explicit local-file verification.
      // DownloadService.initialize() will verify and restore this marker.
      offlineVerifiedAt:
        persistedVersion < DOWNLOAD_STORE_VERSION
          ? undefined
          : task.offlineVerifiedAt,
    };
  }

  return { ...state, tasks };
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: {},
      addTask: (id, mediaInfo, playbackSession, originalStream) => {
        const timestamp = nowIso();
        set((state) => ({
          tasks: {
            ...state.tasks,
            [id]: {
              id,
              mediaInfo,
              progress: 0,
              status: "Pending",
              totalBytesWritten: 0,
              totalBytesExpectedToWrite: 0,
              playbackSession,
              originalStream,
              createdAt: state.tasks[id]?.createdAt || timestamp,
              updatedAt: timestamp,
            },
          },
        }));
      },
      updateProgress: (
        id,
        progress,
        totalBytesWritten,
        totalBytesExpectedToWrite,
      ) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                progress: Math.max(0, Math.min(progress || 0, 1)),
                totalBytesWritten: Math.max(0, totalBytesWritten || 0),
                totalBytesExpectedToWrite: Math.max(
                  0,
                  totalBytesExpectedToWrite || 0,
                ),
                updatedAt: nowIso(),
              },
            },
          };
        }),
      setStatus: (id, status, localUri, error, resumeData) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                status,
                localUri: localUri ?? task.localUri,
                error: status === "Error" ? error || task.error : undefined,
                resumeData: resumeData ?? task.resumeData,
                offlineVerifiedAt:
                  status === "Completed" ? task.offlineVerifiedAt : undefined,
                updatedAt: nowIso(),
              },
            },
          };
        }),
      removeTask: (id) =>
        set((state) => {
          const newTasks = { ...state.tasks };
          delete newTasks[id];
          return { tasks: newTasks };
        }),
      isDownloaded: (id: string) => {
        return isTaskOfflinePlayable(get().tasks[id]);
      },
      clearAll: () => set({ tasks: {} }),
      setResumeData: (id, data) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, resumeData: data, updatedAt: nowIso() },
            },
          };
        }),
      setDownloadUrl: (id, downloadUrl) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                mediaInfo: {
                  ...task.mediaInfo,
                  downloadUrl,
                },
                updatedAt: nowIso(),
              },
            },
          };
        }),
      markVerified: (id, localUri) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          const timestamp = nowIso();
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                status: "Completed",
                localUri,
                progress: 1,
                error: undefined,
                offlineVerifiedAt: timestamp,
                updatedAt: timestamp,
              },
            },
          };
        }),
      markFileMissing: (id, error) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                status: "Error",
                error,
                offlineVerifiedAt: undefined,
                updatedAt: nowIso(),
              },
            },
          };
        }),
    }),
    {
      name: "download-storage",
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
      version: DOWNLOAD_STORE_VERSION,
      migrate: (persistedState, persistedVersion) =>
        migrateDownloadTasks(persistedState, persistedVersion),
      partialize: (state) => ({ tasks: state.tasks }),
    },
  ),
);
