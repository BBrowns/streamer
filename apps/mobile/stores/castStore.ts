import { create } from "zustand";
import type { MediaInfo } from "./playerStore";
import type { CastDevice } from "../services/CastService";

export interface ActiveCastSession {
  device: CastDevice;
  mediaInfo: MediaInfo;
  sessionId?: string;
}

interface CastState {
  activeCast: ActiveCastSession | null;
  setActiveCast: (cast: ActiveCastSession) => void;
  clearActiveCast: () => void;
}

export const useCastStore = create<CastState>((set) => ({
  activeCast: null,
  setActiveCast: (activeCast) => set({ activeCast }),
  clearActiveCast: () => set({ activeCast: null }),
}));
