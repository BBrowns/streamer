import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Stream } from "@streamer/shared";

export interface MediaInfo {
  type: "movie" | "series";
  itemId: string;
  title: string;
  poster?: string;
  season?: number;
  episode?: number;
}

interface PlayerState {
  currentStream: Stream | null;
  mediaInfo: MediaInfo | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;

  // Persisted preferences
  playbackRate: number;
  preferredQuality: "auto" | "1080p" | "720p" | "480p";
  preferredAudioLang: string | null;
  preferredSubtitleLang: string | null;

  setStream: (stream: Stream, media?: MediaInfo) => void;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPreferredQuality: (quality: PlayerState["preferredQuality"]) => void;
  setPreferredAudioLang: (lang: string | null) => void;
  setPreferredSubtitleLang: (lang: string | null) => void;
  clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      currentStream: null,
      mediaInfo: null,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1.0,
      preferredQuality: "auto",
      preferredAudioLang: null,
      preferredSubtitleLang: null,

      setStream: (stream, media) =>
        set({
          currentStream: stream,
          mediaInfo: media ?? null,
          isPlaying: true,
        }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setBuffering: (buffering) => set({ isBuffering: buffering }),
      setProgress: (currentTime, duration) => set({ currentTime, duration }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setPreferredQuality: (quality) => set({ preferredQuality: quality }),
      setPreferredAudioLang: (lang) => set({ preferredAudioLang: lang }),
      setPreferredSubtitleLang: (lang) => set({ preferredSubtitleLang: lang }),
      clearPlayer: () =>
        set({
          currentStream: null,
          mediaInfo: null,
          isPlaying: false,
          isBuffering: false,
          currentTime: 0,
          duration: 0,
        }),
    }),
    {
      name: "player-preferences",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist user preferences, not transient playback state
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        preferredQuality: state.preferredQuality,
        preferredAudioLang: state.preferredAudioLang,
        preferredSubtitleLang: state.preferredSubtitleLang,
      }),
    },
  ),
);
