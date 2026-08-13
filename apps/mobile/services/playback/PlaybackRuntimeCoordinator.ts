import type { PlaybackRuntimeError } from "@streamer/shared";

export type PlaybackSourceReplacementReason =
  "seekable_handoff" | "audio_track" | "quality";

export type PlaybackRuntimeViewState =
  | { kind: "idle" }
  | { kind: "planning" }
  | { kind: "preparing_source" }
  | { kind: "loading_media" }
  | {
      kind: "buffering";
      hasRenderedFrame: boolean;
      shouldPlay: boolean;
      resumeAt?: number;
    }
  | { kind: "playing"; hasRenderedFrame: true }
  | { kind: "paused"; hasRenderedFrame: boolean }
  | {
      kind: "scrubbing";
      previewPosition: number;
      shouldPlay: boolean;
    }
  | {
      kind: "replacing_source";
      reason: PlaybackSourceReplacementReason;
      resumeAt: number;
      shouldPlay: boolean;
    }
  | {
      kind: "switching_fallback";
      resumeAt: number;
      shouldPlay: boolean;
      attempt: number;
    }
  | { kind: "completed" }
  | { kind: "failed"; error: PlaybackRuntimeError }
  | { kind: "cancelled" };

export type PlaybackRuntimeViewEvent =
  | { type: "planning_started" }
  | { type: "source_preparation_started" }
  | { type: "media_loading" }
  | { type: "media_ready"; shouldPlay: boolean }
  | { type: "first_frame_rendered" }
  | { type: "playing_changed"; isPlaying: boolean }
  | { type: "buffering_started" }
  | { type: "scrubbing_started"; previewPosition: number }
  | { type: "scrubbing_previewed"; previewPosition: number }
  | { type: "scrubbing_committed" }
  | { type: "scrubbing_cancelled" }
  | {
      type: "source_replacement_started";
      reason: PlaybackSourceReplacementReason;
      resumeAt: number;
    }
  | { type: "source_replacement_completed" }
  | { type: "fallback_started"; resumeAt: number; attempt: number }
  | { type: "fallback_media_ready" }
  | { type: "completed" }
  | { type: "failed"; error: PlaybackRuntimeError }
  | { type: "cancelled" }
  | { type: "reset" };

export const initialPlaybackRuntimeViewState: PlaybackRuntimeViewState = {
  kind: "idle",
};

function viewerShouldPlay(state: PlaybackRuntimeViewState) {
  switch (state.kind) {
    case "playing":
      return true;
    case "buffering":
    case "scrubbing":
    case "replacing_source":
    case "switching_fallback":
      return state.shouldPlay;
    default:
      return false;
  }
}

function hasRenderedFrame(state: PlaybackRuntimeViewState) {
  switch (state.kind) {
    case "playing":
    case "paused":
      return state.hasRenderedFrame;
    case "buffering":
      return state.hasRenderedFrame;
    default:
      return false;
  }
}

/**
 * Runtime-only view state derived from media/session events. It deliberately
 * contains no source identities and is never persisted.
 */
export function reducePlaybackRuntimeViewState(
  state: PlaybackRuntimeViewState,
  event: PlaybackRuntimeViewEvent,
): PlaybackRuntimeViewState {
  switch (event.type) {
    case "planning_started":
      return { kind: "planning" };
    case "source_preparation_started":
      return { kind: "preparing_source" };
    case "media_loading":
      return { kind: "loading_media" };
    case "media_ready":
      return {
        kind: "buffering",
        hasRenderedFrame: false,
        shouldPlay: event.shouldPlay,
      };
    case "first_frame_rendered":
      return viewerShouldPlay(state)
        ? { kind: "playing", hasRenderedFrame: true }
        : { kind: "paused", hasRenderedFrame: true };
    case "playing_changed":
      if (event.isPlaying && hasRenderedFrame(state)) {
        return { kind: "playing", hasRenderedFrame: true };
      }
      if (!event.isPlaying) {
        return {
          kind: "paused",
          hasRenderedFrame: hasRenderedFrame(state),
        };
      }
      return {
        kind: "buffering",
        hasRenderedFrame: false,
        shouldPlay: true,
      };
    case "buffering_started":
      return {
        kind: "buffering",
        hasRenderedFrame: hasRenderedFrame(state),
        shouldPlay: viewerShouldPlay(state),
      };
    case "scrubbing_started":
      return {
        kind: "scrubbing",
        previewPosition: event.previewPosition,
        shouldPlay: viewerShouldPlay(state),
      };
    case "scrubbing_previewed":
      return state.kind === "scrubbing"
        ? { ...state, previewPosition: event.previewPosition }
        : state;
    case "scrubbing_committed":
    case "scrubbing_cancelled":
      if (state.kind !== "scrubbing") return state;
      return state.shouldPlay
        ? { kind: "playing", hasRenderedFrame: true }
        : { kind: "paused", hasRenderedFrame: true };
    case "source_replacement_started":
      return {
        kind: "replacing_source",
        reason: event.reason,
        resumeAt: event.resumeAt,
        shouldPlay: viewerShouldPlay(state),
      };
    case "source_replacement_completed":
      if (state.kind !== "replacing_source") return state;
      return state.shouldPlay
        ? { kind: "playing", hasRenderedFrame: true }
        : { kind: "paused", hasRenderedFrame: true };
    case "fallback_started":
      return {
        kind: "switching_fallback",
        resumeAt: event.resumeAt,
        shouldPlay: viewerShouldPlay(state),
        attempt: event.attempt,
      };
    case "fallback_media_ready":
      if (state.kind !== "switching_fallback") return state;
      return {
        kind: "buffering",
        hasRenderedFrame: false,
        shouldPlay: state.shouldPlay,
        resumeAt: state.resumeAt,
      };
    case "completed":
      return { kind: "completed" };
    case "failed":
      return { kind: "failed", error: event.error };
    case "cancelled":
      return { kind: "cancelled" };
    case "reset":
      return initialPlaybackRuntimeViewState;
  }
}
