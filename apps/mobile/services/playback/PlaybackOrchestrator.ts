import type {
  PlaybackErrorCode,
  PlaybackPlan,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  Stream,
} from "@streamer/shared";
import type { MediaInfo } from "../../stores/playerStore";
import {
  getDownloadEligibility,
  type DownloadEligibility,
} from "../downloadEligibility";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "./PlaybackPlanService";
import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
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

interface ResolvedActionSuccess {
  ok: true;
  stream: Stream;
  uri: string;
  remainingStreams: Stream[];
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

type ResolvedActionResult = ResolvedActionSuccess | PlaybackOrchestratorFailure;

export interface DownloadOrchestratorSuccess {
  ok: true;
  stream: Stream;
  resolvedUrl: string;
  mediaInfo: MediaInfo;
  eligibility: DownloadEligibility;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type DownloadOrchestratorResult =
  | DownloadOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export interface CastOrchestratorSuccess {
  ok: true;
  stream: Stream;
  resolvedUrl: string;
  mediaInfo: MediaInfo;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type CastOrchestratorResult =
  | CastOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export async function playBest(
  input: PlaybackOrchestratorInput,
): Promise<PlaybackOrchestratorResult> {
  const fallback = "Playback is unavailable right now.";
  const result = await resolveActionPlan(input, "play", fallback);

  if (!result.ok) return result;

  return {
    ok: true,
    stream: result.stream,
    mediaInfo: buildMediaInfo(input, result.stream),
    fallbackStreams: result.remainingStreams,
    runtimeState: "buffering",
    plan: result.plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.resolveErrors,
  };
}

export async function prepareDownload(
  input: PlaybackOrchestratorInput,
): Promise<DownloadOrchestratorResult> {
  const fallback = "Download is unavailable right now.";
  const result = await resolveActionPlan(input, "download", fallback);

  if (!result.ok) return result;

  const eligibility = getDownloadEligibility(result.stream);
  if (!eligibility.canDownload) {
    const failure = mapDownloadEligibilityToRuntimeFailure(eligibility);
    return {
      ok: false,
      ...failure,
      plan: result.plan,
      attemptedStreams: result.attemptedStreams,
      resolveErrors: result.resolveErrors,
    };
  }

  return {
    ok: true,
    stream: result.stream,
    resolvedUrl: result.uri,
    mediaInfo: buildMediaInfo(input, result.stream),
    eligibility,
    runtimeState: "selecting_source",
    plan: result.plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.resolveErrors,
  };
}

export async function prepareCast(
  input: PlaybackOrchestratorInput,
): Promise<CastOrchestratorResult> {
  const fallback = "Casting is unavailable right now.";
  const result = await resolveActionPlan(input, "cast", fallback);

  if (!result.ok) return result;

  return {
    ok: true,
    stream: result.stream,
    resolvedUrl: result.uri,
    mediaInfo: buildMediaInfo(input, result.stream),
    runtimeState: "buffering",
    plan: result.plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.resolveErrors,
  };
}

async function resolveActionPlan(
  input: PlaybackOrchestratorInput,
  action: "play" | "download" | "cast",
  fallback: string,
): Promise<ResolvedActionResult> {
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action,
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
    uri: result.resolved.uri,
    remainingStreams: result.remainingStreams,
    plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.errors,
  };
}

function mapDownloadEligibilityToRuntimeFailure(
  eligibility: DownloadEligibility,
) {
  const message =
    eligibility.reason || "This source cannot be saved for offline playback.";
  const code: PlaybackErrorCode =
    eligibility.mode === "bridge-torrent"
      ? "BRIDGE_UNAVAILABLE"
      : "SOURCE_UNAVAILABLE";
  const error = createPlaybackRuntimeError(code, message, {
    retryable: eligibility.mode === "bridge-torrent",
    shouldFallback: eligibility.mode !== "bridge-torrent",
  });

  return {
    error,
    runtimeState: getPlaybackRuntimeState(error.code),
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
