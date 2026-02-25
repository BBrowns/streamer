import { create } from 'zustand';
import type { Stream } from '@streamer/shared';

export interface MediaInfo {
    type: 'movie' | 'series';
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

    setStream: (stream: Stream, media?: MediaInfo) => void;
    setPlaying: (playing: boolean) => void;
    setBuffering: (buffering: boolean) => void;
    setProgress: (currentTime: number, duration: number) => void;
    clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    currentStream: null,
    mediaInfo: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,

    setStream: (stream, media) =>
        set({ currentStream: stream, mediaInfo: media ?? null, isPlaying: true }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setBuffering: (buffering) => set({ isBuffering: buffering }),
    setProgress: (currentTime, duration) => set({ currentTime, duration }),
    clearPlayer: () =>
        set({
            currentStream: null,
            mediaInfo: null,
            isPlaying: false,
            isBuffering: false,
            currentTime: 0,
            duration: 0,
        }),
}));
