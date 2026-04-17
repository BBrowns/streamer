import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import EventSource from "react-native-sse";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Stream } from "@streamer/shared";

export interface MediaInfo {
  type: "movie" | "series";
  itemId: string;
  title: string;
  poster?: string;
  season?: number;
  episode?: number;
}

export interface StreamMetrics {
  state: "finding_peers" | "connecting" | "downloading" | "ready";
  numPeers: number;
  downloadSpeed: number;
  progress: number;
  downloaded: number;
}

export type StreamLoadState = "idle" | "loading_metrics" | "playing" | "error";

interface PlayerState {
  currentStream: Stream | null;
  mediaInfo: MediaInfo | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;

  streamState: StreamLoadState;
  streamMetrics: StreamMetrics | null;
  errorMessage: string | null;

  // Active SSE connection & timeout refs
  _eventSource: EventSource | null;
  _peerTimeout: ReturnType<typeof setTimeout> | null;

  // Persisted preferences
  playbackRate: number;
  preferredQuality: "auto" | "1080p" | "720p" | "480p";
  preferredAudioLang: string | null;
  preferredSubtitleLang: string | null;
  autoPlayNext: boolean;

  setStream: (stream: Stream, media?: MediaInfo) => void;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setPreferredQuality: (quality: PlayerState["preferredQuality"]) => void;
  setPreferredAudioLang: (lang: string | null) => void;
  setPreferredSubtitleLang: (lang: string | null) => void;
  subscribeToStreamMetrics: (infoHash: string) => void;
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
      streamState: "idle",
      streamMetrics: null,
      errorMessage: null,
      _eventSource: null,
      _peerTimeout: null,
      playbackRate: 1.0,
      preferredQuality: "auto",
      preferredAudioLang: null,
      preferredSubtitleLang: null,
      autoPlayNext: true,

      setStream: (stream, media) =>
        set({
          currentStream: stream,
          mediaInfo: media ?? null,
          isPlaying: true,
          streamState: "loading_metrics",
          errorMessage: null,
        }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setBuffering: (buffering) => set({ isBuffering: buffering }),
      setProgress: (currentTime, duration) => set({ currentTime, duration }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setPreferredQuality: (quality) => set({ preferredQuality: quality }),
      setPreferredAudioLang: (lang) => set({ preferredAudioLang: lang }),
      setPreferredSubtitleLang: (lang) => set({ preferredSubtitleLang: lang }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),

      subscribeToStreamMetrics: (infoHash) => {
        const state = usePlayerStore.getState();
        // Clean up previous if exists
        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) {
          clearTimeout(state._peerTimeout);
        }

        // Derive bridge URL dynamically from Metro host
        let bridgeUrl: string;
        if (Platform.OS === "web") {
          bridgeUrl = "http://localhost:11470";
        } else if (Platform.OS === "android") {
          bridgeUrl = "http://10.0.2.2:11470";
        } else {
          const metroHost = Constants.expoConfig?.hostUri;
          const ip = metroHost ? metroHost.split(":")[0] : "localhost";
          bridgeUrl = `http://${ip}:11470`;
        }
        const es = new EventSource(
          `${bridgeUrl}/api/torrent/${infoHash}/metrics`,
        );

        const timeout = setTimeout(() => {
          const currentMetrics = usePlayerStore.getState().streamMetrics;
          if (!currentMetrics || currentMetrics.numPeers === 0) {
            es.removeAllEventListeners();
            es.close();
            set({
              streamState: "error",
              errorMessage:
                "No peers found after 45 seconds. The torrent may be inactive or the stream-server may not be reachable.",
              _eventSource: null,
              _peerTimeout: null,
            });
          }
        }, 45000);

        es.addEventListener("message", (event) => {
          if (!event.data) return;
          try {
            const metrics: StreamMetrics = JSON.parse(event.data);

            // If we've found peers, we can safely clear the 15s timeout
            if (metrics.numPeers > 0) {
              const currentTimeout = usePlayerStore.getState()._peerTimeout;
              if (currentTimeout) clearTimeout(currentTimeout);
            }

            set({
              streamMetrics: metrics,
              streamState:
                metrics.state === "ready" || metrics.state === "downloading"
                  ? "playing"
                  : "loading_metrics",
            });
          } catch (e) {
            console.error("Failed to parse stream metric:", e);
          }
        });

        es.addEventListener("error", (err) => {
          console.error("EventSource metrics error:", err);
          // If it's a 404 or transient error, retry a few times instead of failing immediately
          const currentRetries = (es as any)._retries || 0;
          if (currentRetries < 5) {
            (es as any)._retries = currentRetries + 1;
            setTimeout(() => {
              usePlayerStore.getState().subscribeToStreamMetrics(infoHash);
            }, 3000);
            return;
          }

          set({
            streamState: "error",
            errorMessage: "Failed to connect to streaming engine metrics",
          });
          es.close();
        });

        set({
          _eventSource: es,
          _peerTimeout: timeout,
          streamState: "loading_metrics",
        });
      },

      clearPlayer: () => {
        const state = usePlayerStore.getState();
        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) clearTimeout(state._peerTimeout);

        set({
          currentStream: null,
          mediaInfo: null,
          isPlaying: false,
          isBuffering: false,
          currentTime: 0,
          duration: 0,
          streamState: "idle",
          streamMetrics: null,
          errorMessage: null,
          _eventSource: null,
          _peerTimeout: null,
        });
      },
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
        autoPlayNext: state.autoPlayNext,
      }),
    },
  ),
);
