import type { PlaybackRuntimeError, Stream } from "@streamer/shared";
import {
  castService,
  type CastContentType,
  type CastDevice,
} from "../CastService";
import {
  createPlaybackRuntimeError,
  inferPlaybackErrorCodeFromMessages,
} from "./PlaybackErrors";
import {
  advanceCastSessionAfterFailure,
  cancelPlaybackSession,
  markPlaybackSessionCasting,
} from "./PlaybackSessionPlaybackService";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";

export interface PreparedCastSource {
  sessionId: string;
  candidateId: string;
  attemptId: string;
  stream: Stream;
  uri: string;
}

export interface CastSessionStartSuccess extends PreparedCastSource {
  ok: true;
}

export interface CastSessionStartFailure {
  ok: false;
  sessionId: string;
  error: PlaybackRuntimeError;
}

export type CastSessionStartResult =
  | CastSessionStartSuccess
  | CastSessionStartFailure;

export function getCastContentType(
  stream: Stream,
  uri: string,
): CastContentType {
  const source = `${stream.url || ""} ${uri}`.toLowerCase();
  return source.includes(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : "video/mp4";
}

function toCastRuntimeError(error: unknown): PlaybackRuntimeError {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const code =
    inferPlaybackErrorCodeFromMessages([rawMessage]) || "SOURCE_UNAVAILABLE";

  return createPlaybackRuntimeError(
    code,
    "This source could not start on the selected display.",
    {
      retryable: true,
      shouldFallback: true,
      debugMessage: rawMessage || undefined,
    },
  );
}

export async function startCastSession(
  device: CastDevice,
  title: string,
  prepared: PreparedCastSource,
): Promise<CastSessionStartResult> {
  let source = prepared;

  while (true) {
    markPlaybackSessionCasting(source.sessionId);

    try {
      await castService.play(
        device.id,
        source.uri,
        title,
        getCastContentType(source.stream, source.uri),
      );
      return { ok: true, ...source };
    } catch (error) {
      const runtimeError = toCastRuntimeError(error);
      addMobileBreadcrumb({
        category: "cast",
        message: "cast.failed",
        level: "warning",
        data: {
          sessionId: source.sessionId,
          candidateId: source.candidateId,
          attemptId: source.attemptId,
          deviceType: device.type,
          contentType: getCastContentType(source.stream, source.uri),
          code: runtimeError.code,
          shouldFallback: runtimeError.shouldFallback,
        },
      });
      const fallback = await advanceCastSessionAfterFailure(
        source.sessionId,
        source.candidateId,
        source.attemptId,
        runtimeError,
      );

      if (!fallback.ok) {
        return {
          ok: false,
          sessionId: source.sessionId,
          error: fallback.error,
        };
      }

      source = {
        sessionId: fallback.sessionId,
        candidateId: fallback.candidateId,
        attemptId: fallback.attemptId,
        stream: fallback.stream,
        uri: fallback.uri,
      };
    }
  }
}

export async function stopCastSession(
  deviceId: string,
  sessionId?: string | null,
) {
  try {
    await castService.control(deviceId, "stop");
  } finally {
    if (sessionId) {
      cancelPlaybackSession(sessionId, "User stopped casting.");
    }
  }
}
