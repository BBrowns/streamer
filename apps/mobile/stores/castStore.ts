import { create } from "zustand";
import type { MediaInfo } from "./playerStore";
import type { CastDevice } from "../services/CastService";

export interface ActiveCastSession {
  device: CastDevice;
  mediaInfo: MediaInfo;
  sessionId?: string;
  isPaused?: boolean;
  currentTime?: number;
  duration?: number;
  playerState?: string;
}

interface CastState {
  activeCast: ActiveCastSession | null;
  setActiveCast: (cast: ActiveCastSession) => void;
  setCastPaused: (isPaused: boolean) => void;
  setCastStatus: (status: {
    isPaused: boolean;
    currentTime: number;
    duration: number;
    playerState: string;
  }) => void;
  clearActiveCast: () => void;
}

export const useCastStore = create<CastState>((set) => ({
  activeCast: null,
  setActiveCast: (activeCast) => set({ activeCast }),
  setCastPaused: (isPaused) =>
    set((state) => ({
      activeCast: state.activeCast ? { ...state.activeCast, isPaused } : null,
    })),
  setCastStatus: (status) =>
    set((state) => ({
      activeCast: state.activeCast ? { ...state.activeCast, ...status } : null,
    })),
  clearActiveCast: () => set({ activeCast: null }),
}));
