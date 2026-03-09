import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import type { MediaInfo } from "./playerStore";

export interface DownloadMediaItem extends MediaInfo {
  downloadUrl: string; // The URL that was downloaded (local stream engine or remote)
}

export type DownloadStatus =
  | "Pending"
  | "Downloading"
  | "Completed"
  | "Error"
  | "Paused";

export interface DownloadTask {
  id: string; // unique ID, e.g., the media stream URL or a UUID
  mediaInfo: DownloadMediaItem;
  localUri?: string; // final local file path
  progress: number; // 0 to 1
  status: DownloadStatus;
  error?: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

interface DownloadState {
  tasks: Record<string, DownloadTask>;
  addTask: (id: string, mediaInfo: DownloadMediaItem) => void;
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
  ) => void;
  removeTask: (id: string) => void;
  isDownloaded: (id: string) => boolean;
  clearAll: () => void;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: {},
      addTask: (id, mediaInfo) =>
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
            },
          },
        })),
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
                progress,
                totalBytesWritten,
                totalBytesExpectedToWrite,
              },
            },
          };
        }),
      setStatus: (id, status, localUri, error) =>
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
                error,
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
        const task = get().tasks[id];
        return task?.status === "Completed" && !!task?.localUri;
      },
      clearAll: () => set({ tasks: {} }),
    }),
    {
      name: "download-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
