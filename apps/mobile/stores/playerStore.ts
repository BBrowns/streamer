import { create } from 'zustand';
import type { Stream } from '@streamer/shared';

interface PlayerState {
    currentStream: Stream | null;
    isPlaying: boolean;
    isBuffering: boolean;
    currentTime: number;
    duration: number;

    setStream: (stream: Stream) => void;
    setPlaying: (playing: boolean) => void;
    setBuffering: (buffering: boolean) => void;
    setProgress: (currentTime: number, duration: number) => void;
    clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    currentStream: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,

    setStream: (stream) => set({ currentStream: stream, isPlaying: true }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setBuffering: (buffering) => set({ isBuffering: buffering }),
    setProgress: (currentTime, duration) => set({ currentTime, duration }),
    clearPlayer: () =>
        set({
            currentStream: null,
            isPlaying: false,
            isBuffering: false,
            currentTime: 0,
            duration: 0,
        }),
}));
