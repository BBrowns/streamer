import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Stream } from "@streamer/shared";
import type { MediaInfo } from "./playerStore";
import { useAuthStore } from "./authStore";

export interface DownloadMediaItem extends MediaInfo {
  // Runtime-only. Sanitized out of persisted storage because resolved URLs can
  // be signed, private, or short-lived.
  downloadUrl?: string;
  sourceId?: string;
}

export interface DownloadReplanContext {
  type: "movie" | "series";
  id: string;
  title?: string;
  poster?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
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
  // Runtime-only. Sanitized out of persisted storage.
  originalStream?: Stream;
  replanContext?: DownloadReplanContext;
}

export interface DownloadState {
  tasks: Record<string, DownloadTask>;
  addTask: (
    id: string,
    mediaInfo: DownloadMediaItem,
    playbackSession?: DownloadPlaybackSessionContext,
    originalStream?: Stream,
    replanContext?: DownloadReplanContext,
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
  setPlaybackSession: (
    id: string,
    playbackSession?: DownloadPlaybackSessionContext,
  ) => void;
  markVerified: (id: string, localUri: string) => void;
  markFileMissing: (id: string, error: string) => void;
}

export const DOWNLOAD_STORE_VERSION = 3;

function nowIso() {
  return new Date().toISOString();
}

export function buildDownloadReplanContext(
  mediaInfo: Partial<DownloadMediaItem> | undefined,
): DownloadReplanContext | undefined {
  if (
    !mediaInfo?.itemId ||
    (mediaInfo.type !== "movie" && mediaInfo.type !== "series")
  ) {
    return undefined;
  }

  return {
    type: mediaInfo.type,
    id: mediaInfo.itemId,
    title: mediaInfo.title,
    poster: mediaInfo.poster,
    season: mediaInfo.season,
    episode: mediaInfo.episode,
  };
}

export function isSensitiveDownloadId(id: string) {
  return (
    /^https?:\/\//i.test(id) ||
    /^magnet:/i.test(id) ||
    /^[a-f0-9]{32,64}$/i.test(id)
  );
}

export function stableDownloadHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function safeDownloadTaskId(
  requestedId: string | undefined,
  mediaInfo?: Partial<DownloadMediaItem>,
) {
  const trimmed = requestedId?.trim();
  if (trimmed && !isSensitiveDownloadId(trimmed)) return trimmed;

  const contentKey = [
    mediaInfo?.type,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.episode,
  ]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(":");

  if (contentKey) return `download-${stableDownloadHash(contentKey)}`;
  return undefined;
}

export function sanitizeDownloadTaskForPersistence(task: DownloadTask) {
  const {
    originalStream: _originalStream,
    resumeData: _resumeData,
    ...safeTask
  } = task;

  return {
    ...safeTask,
    mediaInfo: {
      ...safeTask.mediaInfo,
      downloadUrl: "",
    },
    replanContext:
      safeTask.replanContext || buildDownloadReplanContext(safeTask.mediaInfo),
  };
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

    const safeId = safeDownloadTaskId(id, task.mediaInfo) || id;
    tasks[safeId] = sanitizeDownloadTaskForPersistence({
      ...task,
      id: safeId,
      createdAt: task.createdAt || migratedAt,
      updatedAt: task.updatedAt || migratedAt,
      // Existing completed tasks predate explicit local-file verification.
      // DownloadService.initialize() will verify and restore this marker.
      offlineVerifiedAt:
        persistedVersion < 2 ? undefined : task.offlineVerifiedAt,
    });
  }

  return { ...state, tasks };
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: {},
      addTask: (
        id,
        mediaInfo,
        playbackSession,
        originalStream,
        replanContext,
      ) => {
        const timestamp = nowIso();
        const safeId = safeDownloadTaskId(id, mediaInfo) || id;
        set((state) => ({
          tasks: {
            ...state.tasks,
            [safeId]: {
              id: safeId,
              mediaInfo,
              progress: 0,
              status: "Pending",
              totalBytesWritten: 0,
              totalBytesExpectedToWrite: 0,
              playbackSession,
              originalStream,
              replanContext:
                replanContext || buildDownloadReplanContext(mediaInfo),
              createdAt: state.tasks[safeId]?.createdAt || timestamp,
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
      setPlaybackSession: (id, playbackSession) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...task,
                playbackSession,
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
      partialize: (state) => {
        const tasks: Record<string, DownloadTask> = {};
        for (const [id, task] of Object.entries(state.tasks)) {
          const safeTask = sanitizeDownloadTaskForPersistence(task);
          const safeId = safeDownloadTaskId(id, safeTask.mediaInfo) || id;
          tasks[safeId] = { ...safeTask, id: safeId };
        }
        return { tasks };
      },
    },
  ),
);
