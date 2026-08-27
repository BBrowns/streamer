import { useEffect } from "react";
import type { Stream } from "@streamer/shared";

import type { MediaInfo, StreamLoadState } from "../stores/playerStore";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { getUnsupportedWebCodecReason } from "../services/streamEngine/codecSupport";
import {
  createPlaybackRuntimeError,
  mapPlaybackMessageToRuntimeFailure,
} from "../services/playback/PlaybackErrors";
import { resolvePlaybackSession } from "../services/playback/PlaybackSessionPlaybackService";
import { recordPlaybackDebugEvent } from "../services/playback/playbackDebug";
import type { PlaybackSessionBinding } from "./usePlaybackSessionBinding";

export type PlaybackUriMessage =
  "unsupportedCodec" | "bridgeUnavailable" | "noStream" | "playbackFailed";

type SetSessionStream = (
  stream: Stream,
  media: MediaInfo | undefined,
  sessionId: string,
  candidateId: string,
  attemptId?: string | null,
  fallbackReason?: string | null,
) => void;

export interface UsePlaybackUriBindingOptions {
  currentStream: Stream | null;
  mediaInfo: MediaInfo | null;
  playbackSessionId: string | null;
  playbackCandidateId: string | null;
  playbackAttemptId: string | null;
  resolveAttempt: number;
  setPlaybackUri: (uri: string | null) => void;
  setStreamStatus: (state: StreamLoadState) => void;
  setSessionStream: SetSessionStream;
  setRuntimeFailure: (
    error: ReturnType<typeof createPlaybackRuntimeError>,
  ) => void;
  getErrorMessage: (message: PlaybackUriMessage) => string;
  tryReplanPartialPlayback: PlaybackSessionBinding["tryReplanPartialPlayback"];
  tryAdvanceToFallback: PlaybackSessionBinding["tryAdvanceToFallback"];
}

/**
 * Resolves the opaque playback URI for the current candidate/session.
 *
 * Session-owned candidates are resolved by the playback service. Legacy
 * candidates use the stream-engine adapter. This hook owns only the transient
 * URI binding; planning, fallback, and route cleanup remain in the session
 * binding and durable playback services.
 */
export function usePlaybackUriBinding({
  currentStream,
  mediaInfo,
  playbackSessionId,
  playbackCandidateId,
  playbackAttemptId,
  resolveAttempt,
  setPlaybackUri,
  setStreamStatus,
  setSessionStream,
  setRuntimeFailure,
  getErrorMessage,
  tryReplanPartialPlayback,
  tryAdvanceToFallback,
}: UsePlaybackUriBindingOptions) {
  useEffect(() => {
    let isMounted = true;

    const resolve = async () => {
      if (!currentStream) {
        setPlaybackUri(null);
        return;
      }

      recordPlaybackDebugEvent({
        category: "playback",
        message: "playback.resolve_started",
        data: {
          hasSession: Boolean(playbackSessionId),
          hasCandidate: Boolean(playbackCandidateId),
          hasAttempt: Boolean(playbackAttemptId),
          sourceKind: currentStream.infoHash
            ? "torrent"
            : currentStream.url
              ? "url"
              : "unknown",
        },
      });

      if (
        playbackSessionId &&
        playbackCandidateId &&
        playbackAttemptId &&
        currentStream.url
      ) {
        setPlaybackUri(currentStream.url);
        recordPlaybackDebugEvent({
          category: "playback",
          message: "playback.resolve_ready",
          data: {
            path: "prepared",
            candidateId: playbackCandidateId,
            attemptId: playbackAttemptId,
          },
        });
        return;
      }

      setStreamStatus("loading_metrics");

      if (playbackSessionId) {
        const result = await resolvePlaybackSession(
          playbackSessionId,
          playbackCandidateId || undefined,
        );
        if (!isMounted) return;

        if (!result.ok) {
          recordPlaybackDebugEvent({
            category: "playback",
            message: "playback.resolve_failed",
            level: "warning",
            data: {
              path: "session",
              errorCode: result.error.code,
              retryable: result.error.retryable,
            },
          });
          if (await tryReplanPartialPlayback(playbackSessionId)) return;
          setPlaybackUri(null);
          setRuntimeFailure(result.error);
          return;
        }

        setSessionStream(
          result.stream,
          mediaInfo || undefined,
          result.sessionId,
          result.candidateId,
          result.attemptId,
          result.fallbackReason,
        );
        setPlaybackUri(result.uri);
        recordPlaybackDebugEvent({
          category: "playback",
          message: "playback.resolve_ready",
          data: {
            path: "session",
            candidateId: result.candidateId,
            executionTarget: result.route?.executionTarget,
            delivery: result.route?.delivery,
            hasBridgeJob: Boolean(result.bridgeJobId),
          },
        });
        return;
      }

      const unsupportedCodecReason =
        getUnsupportedWebCodecReason(currentStream);
      if (unsupportedCodecReason) {
        const message = getErrorMessage("unsupportedCodec");
        const error = createPlaybackRuntimeError("UNSUPPORTED_CODEC", message, {
          retryable: false,
          shouldFallback: false,
        });
        if (await tryAdvanceToFallback(error, message)) return;
        if (!isMounted) return;
        setPlaybackUri(null);
        setRuntimeFailure(error);
        return;
      }

      try {
        const uri = await streamEngineManager.getPlaybackUri(currentStream);
        if (!isMounted) return;

        if (uri && uri.length > 0) {
          setPlaybackUri(uri);
          recordPlaybackDebugEvent({
            category: "playback",
            message: "playback.resolve_ready",
            data: {
              path: "legacy",
              engine: streamEngineManager
                .resolveEngine(currentStream)
                ?.getEngineType(),
            },
          });
          return;
        }

        const message = currentStream.infoHash
          ? getErrorMessage("bridgeUnavailable")
          : getErrorMessage("noStream");
        const error = createPlaybackRuntimeError(
          currentStream.infoHash ? "BRIDGE_UNAVAILABLE" : "SOURCE_UNAVAILABLE",
          message,
          { retryable: true, shouldFallback: false },
        );
        if (await tryAdvanceToFallback(error, message)) return;

        setPlaybackUri(null);
        setRuntimeFailure(error);
        recordPlaybackDebugEvent({
          category: "playback",
          message: "playback.resolve_failed",
          level: "warning",
          data: {
            path: "legacy",
            errorCode: error.code,
            retryable: error.retryable,
          },
        });
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : getErrorMessage("playbackFailed");
        const runtimeFailure = mapPlaybackMessageToRuntimeFailure(
          message,
          currentStream.infoHash ? "BRIDGE_UNAVAILABLE" : "SOURCE_UNAVAILABLE",
          { retryable: true, shouldFallback: false },
        ).error;
        if (await tryAdvanceToFallback(runtimeFailure, message)) return;

        setPlaybackUri(null);
        setRuntimeFailure(runtimeFailure);
        recordPlaybackDebugEvent({
          category: "playback",
          message: "playback.resolve_failed",
          level: "warning",
          data: {
            path: "legacy",
            errorCode: runtimeFailure.code,
            retryable: runtimeFailure.retryable,
          },
        });
      }
    };

    void resolve();
    return () => {
      isMounted = false;
    };
  }, [
    currentStream,
    getErrorMessage,
    mediaInfo,
    playbackAttemptId,
    playbackCandidateId,
    playbackSessionId,
    resolveAttempt,
    setPlaybackUri,
    setRuntimeFailure,
    setSessionStream,
    setStreamStatus,
    tryAdvanceToFallback,
    tryReplanPartialPlayback,
  ]);
}
