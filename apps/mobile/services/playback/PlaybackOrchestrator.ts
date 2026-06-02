import type {
  PlaybackPlan,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  Stream,
} from "@streamer/shared";
import type { MediaInfo } from "../../stores/playerStore";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "./PlaybackPlanService";
import {
  mapPlaybackPlanToRuntimeFailure,
  mapResolveErrorsToRuntimeFailure,
} from "./PlaybackErrors";

export interface PlaybackOrchestratorInput {
  type: "movie" | "series";
  id: string;
  title?: string;
  poster?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export interface PlaybackOrchestratorSuccess {
  ok: true;
  stream: Stream;
  mediaInfo: MediaInfo;
  fallbackStreams: Stream[];
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export interface PlaybackOrchestratorFailure {
  ok: false;
  error: PlaybackRuntimeError;
  runtimeState: PlaybackRuntimeState;
  plan?: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type PlaybackOrchestratorResult =
  | PlaybackOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export async function playBest(
  input: PlaybackOrchestratorInput,
): Promise<PlaybackOrchestratorResult> {
  const fallback = "Playback is unavailable right now.";
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action: "play",
  });

  if (plan.state !== "ready") {
    const failure = mapPlaybackPlanToRuntimeFailure(plan, fallback);
    return {
      ok: false,
      ...failure,
      plan,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const result = await resolvePlaybackPlan(plan);
  if (!result.resolved) {
    const failure =
      result.errors.length > 0
        ? mapResolveErrorsToRuntimeFailure(result.errors, fallback)
        : mapPlaybackPlanToRuntimeFailure(plan, fallback);

    return {
      ok: false,
      ...failure,
      plan,
      attemptedStreams: result.attemptedStreams,
      resolveErrors: result.errors,
    };
  }

  return {
    ok: true,
    stream: result.resolved.stream,
    mediaInfo: buildMediaInfo(input, result.resolved.stream),
    fallbackStreams: result.remainingStreams,
    runtimeState: "buffering",
    plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.errors,
  };
}

function buildMediaInfo(
  input: PlaybackOrchestratorInput,
  stream: Stream,
): MediaInfo {
  const title = input.episodeTitle
    ? `${input.title || stream.title || "Unknown"} - ${input.episodeTitle}`
    : (input.title ?? stream.title ?? "Unknown");

  return {
    type: input.type,
    itemId: input.id,
    title,
    poster: input.poster,
    season: input.season,
    episode: input.episode,
  };
}
