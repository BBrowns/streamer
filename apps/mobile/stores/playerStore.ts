import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import EventSource from "react-native-sse";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type {
  PlaybackQuality,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  Stream,
} from "@streamer/shared";
import { useAuthStore } from "./authStore";
import { getBridgeAuthHeaders } from "../services/bridgeAuth";
import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
  mapPlaybackMessageToRuntimeFailure,
} from "../services/playback/PlaybackErrors";

export interface MediaInfo {
  type: "movie" | "series";
  itemId: string;
  title: string;
  poster?: string;
  season?: number;
  episode?: number;
}

export type PlaybackLaunchIntent =
  | { type: "play" }
  | { type: "resume"; positionSeconds: number };

export interface StreamMetrics {
  state: "finding_peers" | "connecting" | "downloading" | "ready";
  numPeers: number;
  downloadSpeed: number;
  progress: number;
  downloaded: number;
}

export type StreamLoadState = "idle" | "loading_metrics" | "playing" | "error";

export const PLAYBACK_QUALITY_OPTIONS = [
  "2160p",
  "1080p",
  "720p",
  "480p",
] as const satisfies readonly PlaybackQuality[];

export const PLAYER_PREFERENCES_STORE_VERSION = 1;

function isPlaybackQuality(value: unknown): value is PlaybackQuality {
  return PLAYBACK_QUALITY_OPTIONS.includes(value as PlaybackQuality);
}

function migrateLegacyPreferredQuality(value: unknown): PlaybackQuality[] {
  switch (value) {
    case "1080p":
      return ["1080p", "720p", "480p"];
    case "720p":
      return ["720p", "480p"];
    case "480p":
      return ["480p"];
    case "2160p":
    case "auto":
    default:
      return [...PLAYBACK_QUALITY_OPTIONS];
  }
}

export function normalizePreferredQualities(
  value: unknown,
  legacyPreferredQuality?: unknown,
): PlaybackQuality[] {
  if (Array.isArray(value)) {
    const requested = new Set(value.filter(isPlaybackQuality));
    const normalized = PLAYBACK_QUALITY_OPTIONS.filter((quality) =>
      requested.has(quality),
    );
    if (normalized.length > 0) return [...normalized];
  }

  return migrateLegacyPreferredQuality(legacyPreferredQuality);
}

export function migratePlayerPreferences(persistedState: unknown) {
  const state =
    persistedState && typeof persistedState === "object"
      ? (persistedState as Record<string, unknown>)
      : {};
  const { preferredQuality, ...preferences } = state;

  return {
    ...preferences,
    preferredQualities: normalizePreferredQualities(
      state.preferredQualities,
      preferredQuality,
    ),
  };
}

interface PlayerState {
  currentStream: Stream | null;
  mediaInfo: MediaInfo | null;
  fallbackStreams: Stream[];
  fallbackReason: string | null;
  playbackSessionId: string | null;
  playbackCandidateId: string | null;
  playbackAttemptId: string | null;
  playbackLaunchIntent: PlaybackLaunchIntent | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;

  streamState: StreamLoadState;
  streamMetrics: StreamMetrics | null;
  errorMessage: string | null;
  runtimeState: PlaybackRuntimeState;
  runtimeError: PlaybackRuntimeError | null;

  // Active SSE connection & timeout refs
  _eventSource: EventSource | null;
  _peerTimeout: ReturnType<typeof setTimeout> | null;

  // Persisted preferences
  playbackRate: number;
  preferredQualities: PlaybackQuality[];
  preferredAudioLang: string | null;
  preferredSubtitleLang: string | null;
  autoPlayNext: boolean;

  setStream: (
    stream: Stream,
    media?: MediaInfo,
    fallbackStreams?: Stream[],
  ) => void;
  setSessionStream: (
    stream: Stream,
    media: MediaInfo | undefined,
    sessionId: string,
    candidateId: string,
    attemptId?: string | null,
    fallbackReason?: string | null,
    launchIntent?: PlaybackLaunchIntent | null,
  ) => void;
  consumePlaybackLaunchIntent: () => PlaybackLaunchIntent | null;
  advanceToNextFallback: (reason?: string | null) => Stream | null;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setStreamStatus: (
    state: StreamLoadState,
    errorMessage?: string | null,
  ) => void;
  setRuntimeState: (
    runtimeState: PlaybackRuntimeState,
    runtimeError?: PlaybackRuntimeError | null,
  ) => void;
  setRuntimeFailure: (error: PlaybackRuntimeError) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setPreferredQualities: (qualities: PlaybackQuality[]) => void;
  setPreferredAudioLang: (lang: string | null) => void;
  setPreferredSubtitleLang: (lang: string | null) => void;
  subscribeToStreamMetrics: (infoHash: string) => void;
  clearPlayer: () => void;
}

function getRuntimeStateForStreamStatus(
  streamState: StreamLoadState,
  state: PlayerState,
  errorMessage: string | null,
): PlaybackRuntimeState {
  if (streamState === "idle") return "idle";
  if (streamState === "playing") return "playing";

  if (streamState === "loading_metrics") {
    if (state.fallbackReason) return "trying_fallback";
    if (state.streamMetrics)
      return getRuntimeStateForMetrics(state.streamMetrics);
    return state.currentStream?.infoHash ? "finding_peers" : "buffering";
  }

  if (state.runtimeError)
    return getPlaybackRuntimeState(state.runtimeError.code);

  return mapPlaybackMessageToRuntimeFailure(
    errorMessage || "Playback is unavailable right now.",
    "UNKNOWN",
  ).runtimeState;
}

function getRuntimeStateForMetrics(
  metrics: StreamMetrics,
): PlaybackRuntimeState {
  if (metrics.state === "finding_peers") return "finding_peers";
  if (metrics.state === "connecting") return "preparing_metadata";
  return "buffering";
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentStream: null,
      mediaInfo: null,
      fallbackStreams: [],
      fallbackReason: null,
      playbackSessionId: null,
      playbackCandidateId: null,
      playbackAttemptId: null,
      playbackLaunchIntent: null,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      streamState: "idle",
      streamMetrics: null,
      errorMessage: null,
      runtimeState: "idle",
      runtimeError: null,
      _eventSource: null,
      _peerTimeout: null,
      playbackRate: 1.0,
      preferredQualities: [...PLAYBACK_QUALITY_OPTIONS],
      preferredAudioLang: null,
      preferredSubtitleLang: null,
      autoPlayNext: true,

      setStream: (stream, media, fallbackStreams = []) => {
        const state = get();
        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) clearTimeout(state._peerTimeout);

        set({
          currentStream: stream,
          mediaInfo: media ?? null,
          fallbackStreams,
          fallbackReason: null,
          playbackSessionId: null,
          playbackCandidateId: null,
          playbackAttemptId: null,
          playbackLaunchIntent: null,
          isPlaying: false,
          isBuffering: true,
          streamState: "loading_metrics",
          streamMetrics: null,
          errorMessage: null,
          runtimeState: stream.infoHash ? "finding_peers" : "buffering",
          runtimeError: null,
          _eventSource: null,
          _peerTimeout: null,
        });
      },
      setSessionStream: (
        stream,
        media,
        sessionId,
        candidateId,
        attemptId = null,
        fallbackReason = null,
        launchIntent,
      ) => {
        const state = get();
        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) clearTimeout(state._peerTimeout);

        const nextLaunchIntent =
          launchIntent !== undefined
            ? launchIntent
            : state.playbackSessionId === sessionId
              ? state.playbackLaunchIntent
              : null;

        set({
          currentStream: stream,
          mediaInfo: media ?? null,
          fallbackStreams: [],
          fallbackReason,
          playbackSessionId: sessionId,
          playbackCandidateId: candidateId,
          playbackAttemptId: attemptId,
          playbackLaunchIntent: nextLaunchIntent,
          isPlaying: false,
          isBuffering: true,
          currentTime: 0,
          duration: 0,
          streamState: "loading_metrics",
          streamMetrics: null,
          errorMessage: null,
          runtimeState: fallbackReason ? "trying_fallback" : "selecting_source",
          runtimeError: null,
          _eventSource: null,
          _peerTimeout: null,
        });
      },
      consumePlaybackLaunchIntent: () => {
        const intent = get().playbackLaunchIntent;
        set({ playbackLaunchIntent: null });
        return intent;
      },
      advanceToNextFallback: (reason = null) => {
        const state = get();
        if (state.playbackSessionId) return null;

        const [nextStream, ...remainingFallbacks] = state.fallbackStreams;
        if (!nextStream) return null;

        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) clearTimeout(state._peerTimeout);

        set({
          currentStream: nextStream,
          fallbackStreams: remainingFallbacks,
          fallbackReason: reason || "Trying another source automatically.",
          isPlaying: false,
          isBuffering: true,
          currentTime: 0,
          duration: 0,
          streamState: "loading_metrics",
          streamMetrics: null,
          errorMessage: null,
          runtimeState: "trying_fallback",
          runtimeError: null,
          _eventSource: null,
          _peerTimeout: null,
        });

        return nextStream;
      },
      setPlaying: (playing) => set({ isPlaying: playing }),
      setBuffering: (buffering) => set({ isBuffering: buffering }),
      setStreamStatus: (streamState, errorMessage = null) =>
        set((state) => {
          const inferredFailure =
            streamState === "error" && !state.runtimeError
              ? mapPlaybackMessageToRuntimeFailure(
                  errorMessage || "Playback is unavailable right now.",
                  "UNKNOWN",
                )
              : null;

          return {
            streamState,
            errorMessage,
            isBuffering: streamState === "loading_metrics",
            fallbackReason:
              streamState === "loading_metrics" ? state.fallbackReason : null,
            runtimeState:
              inferredFailure?.runtimeState ||
              getRuntimeStateForStreamStatus(streamState, state, errorMessage),
            runtimeError:
              streamState === "error"
                ? state.runtimeError || inferredFailure?.error || null
                : null,
          };
        }),
      setRuntimeState: (runtimeState, runtimeError = null) =>
        set({
          runtimeState,
          runtimeError,
        }),
      setRuntimeFailure: (error) =>
        set({
          streamState: "error",
          isBuffering: false,
          isPlaying: false,
          fallbackReason: null,
          errorMessage: error.message,
          runtimeState: getPlaybackRuntimeState(error.code),
          runtimeError: error,
        }),
      setProgress: (currentTime, duration) => set({ currentTime, duration }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setPreferredQualities: (qualities) =>
        set({ preferredQualities: normalizePreferredQualities(qualities) }),
      setPreferredAudioLang: (lang) => set({ preferredAudioLang: lang }),
      setPreferredSubtitleLang: (lang) => set({ preferredSubtitleLang: lang }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),

      subscribeToStreamMetrics: (infoHash) => {
        const normalizedInfoHash = infoHash.toLowerCase();
        const state = get();
        // Clean up previous if exists
        if (state._eventSource) {
          state._eventSource.removeAllEventListeners();
          state._eventSource.close();
        }
        if (state._peerTimeout) {
          clearTimeout(state._peerTimeout);
        }

        // Derive bridge URL dynamically from settings, then fall back to platform defaults.
        let bridgeUrl: string;
        const configuredBridgeUrl = useAuthStore.getState().streamServerUrl;
        if (configuredBridgeUrl) {
          bridgeUrl = configuredBridgeUrl;
        } else if (Platform.OS === "web") {
          bridgeUrl = "http://localhost:11470";
        } else if (Platform.OS === "android") {
          bridgeUrl = "http://10.0.2.2:11470";
        } else {
          const metroHost = Constants.expoConfig?.hostUri;
          const ip = metroHost ? metroHost.split(":")[0] : "localhost";
          bridgeUrl = `http://${ip}:11470`;
        }
        const authHeaders = getBridgeAuthHeaders();
        const eventSourceOptions =
          Object.keys(authHeaders).length > 0
            ? { headers: authHeaders }
            : undefined;
        const es = new EventSource(
          `${bridgeUrl}/api/torrent/${encodeURIComponent(infoHash)}/metrics`,
          eventSourceOptions,
        );

        const timeout = setTimeout(() => {
          const currentState = get();
          const currentStreamInfoHash =
            currentState.currentStream?.infoHash?.toLowerCase();
          if (
            currentStreamInfoHash !== normalizedInfoHash ||
            currentState.streamState === "error"
          ) {
            return;
          }

          const currentMetrics = currentState.streamMetrics;
          if (!currentMetrics || currentMetrics.numPeers === 0) {
            es.removeAllEventListeners();
            es.close();
            const message =
              "No peers found after 45 seconds. The torrent may be inactive or the stream-server may not be reachable.";
            const fallback = currentState.playbackSessionId
              ? null
              : currentState.advanceToNextFallback(
                  "No peers found after 45 seconds. Trying another source automatically.",
                );
            if (fallback) return;

            const failure = mapPlaybackMessageToRuntimeFailure(
              message,
              "NO_PEERS",
              { retryable: true, shouldFallback: false },
            );
            set({
              streamState: "error",
              isBuffering: false,
              errorMessage: failure.error.message,
              runtimeState: failure.runtimeState,
              runtimeError: failure.error,
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
              const currentTimeout = get()._peerTimeout;
              if (currentTimeout) clearTimeout(currentTimeout);
            }

            const currentState = get();
            const currentStreamInfoHash =
              currentState.currentStream?.infoHash?.toLowerCase();
            if (
              currentStreamInfoHash !== normalizedInfoHash ||
              currentState.streamState === "error"
            ) {
              return;
            }

            const nextStreamState = "loading_metrics";

            set({
              streamMetrics: metrics,
              streamState:
                currentState.streamState === "playing"
                  ? "playing"
                  : nextStreamState,
              isBuffering:
                nextStreamState === "loading_metrics" &&
                currentState.streamState !== "playing",
              runtimeState:
                currentState.streamState === "playing"
                  ? "playing"
                  : getRuntimeStateForMetrics(metrics),
              runtimeError: null,
            });
          } catch (e) {
            console.error("Failed to parse stream metric:", e);
          }
        });

        es.addEventListener("error", (err) => {
          // Extract error message if possible to identify "Torrent not found"
          let isTorrentNotFound = false;
          let errorMessage = "";
          try {
            const errObj = typeof err === "string" ? JSON.parse(err) : err;
            errorMessage =
              errObj?.message || (typeof err === "string" ? err : "");
            if (errorMessage.includes("Torrent not found")) {
              isTorrentNotFound = true;
            }
          } catch (e) {
            // ignore parse errors
          }

          const currentRetries = (es as any)._retries || 0;
          const maxRetries = isTorrentNotFound ? 24 : 5;

          if (currentRetries < maxRetries) {
            (es as any)._retries = currentRetries + 1;
            const delay = isTorrentNotFound ? 5000 : 3000;

            // Only log as warning if it's not the "expected" initial race condition
            // or if we've already retried a few times
            if (!isTorrentNotFound || currentRetries > 2) {
              console.warn(
                `[playerStore] Metrics connection transient error (retry ${currentRetries + 1}/${maxRetries}):`,
                errorMessage || err,
              );
            }

            setTimeout(() => {
              const currentState = get();
              const currentStreamInfoHash =
                currentState.currentStream?.infoHash?.toLowerCase();
              if (
                currentStreamInfoHash === normalizedInfoHash &&
                currentState.streamState !== "error" &&
                currentState.streamState !== "playing"
              ) {
                currentState.subscribeToStreamMetrics(infoHash);
              }
            }, delay);
            return;
          }

          console.error("EventSource metrics fatal error:", err);
          const currentState = get();
          const currentStreamInfoHash =
            currentState.currentStream?.infoHash?.toLowerCase();
          if (currentStreamInfoHash !== normalizedInfoHash) {
            es.close();
            return;
          }

          const fallback = currentState.playbackSessionId
            ? null
            : currentState.advanceToNextFallback(
                "Failed to connect to stream metrics. Trying another source automatically.",
              );
          if (fallback) {
            es.close();
            return;
          }

          const failure = createPlaybackRuntimeError(
            "BRIDGE_UNAVAILABLE",
            "Failed to connect to streaming engine metrics",
            { retryable: true, shouldFallback: false },
          );
          set({
            streamState: "error",
            isBuffering: false,
            errorMessage: failure.message,
            runtimeState: getPlaybackRuntimeState(failure.code),
            runtimeError: failure,
            _eventSource: null,
            _peerTimeout: null,
          });
          es.close();
        });

        const currentState = get();
        const currentStreamInfoHash =
          currentState.currentStream?.infoHash?.toLowerCase();
        if (
          currentStreamInfoHash !== normalizedInfoHash ||
          currentState.streamState === "error"
        ) {
          es.removeAllEventListeners();
          es.close();
          clearTimeout(timeout);
          return;
        }

        set({
          _eventSource: es,
          _peerTimeout: timeout,
          streamState: "loading_metrics",
          runtimeState: "finding_peers",
          runtimeError: null,
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
          fallbackStreams: [],
          fallbackReason: null,
          playbackSessionId: null,
          playbackCandidateId: null,
          playbackAttemptId: null,
          playbackLaunchIntent: null,
          isPlaying: false,
          isBuffering: false,
          currentTime: 0,
          duration: 0,
          streamState: "idle",
          streamMetrics: null,
          errorMessage: null,
          runtimeState: "idle",
          runtimeError: null,
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
        preferredQualities: state.preferredQualities,
        preferredAudioLang: state.preferredAudioLang,
        preferredSubtitleLang: state.preferredSubtitleLang,
        autoPlayNext: state.autoPlayNext,
      }),
      version: PLAYER_PREFERENCES_STORE_VERSION,
      migrate: (persistedState) => migratePlayerPreferences(persistedState),
    },
  ),
);
