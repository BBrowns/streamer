import { create } from "zustand";
import type { MediaInfo } from "./playerStore";
import type { CastDevice } from "../services/CastService";

export interface ActiveCastSession {
  device: CastDevice;
  mediaInfo: MediaInfo;
  sessionId?: string;
  isPaused?: boolean;
}

interface CastState {
  activeCast: ActiveCastSession | null;
  setActiveCast: (cast: ActiveCastSession) => void;
  setCastPaused: (isPaused: boolean) => void;
  clearActiveCast: () => void;
}

export const useCastStore = create<CastState>((set) => ({
  activeCast: null,
  setActiveCast: (activeCast) => set({ activeCast }),
  setCastPaused: (isPaused) =>
    set((state) => ({
      activeCast: state.activeCast ? { ...state.activeCast, isPaused } : null,
    })),
  clearActiveCast: () => set({ activeCast: null }),
}));
