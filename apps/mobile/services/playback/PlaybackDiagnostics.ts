import type { StreamerBreadcrumbInput } from "@streamer/shared";

export interface PlaybackDiagnosticsInput {
  engineType: string;
  sourceKind: "direct" | "hls" | "torrent" | "offline" | "unknown";
  runtimeState: string;
  seekable: boolean;
  positionSeconds: number;
  durationSeconds: number;
  bufferedSeconds: number;
  audioLabel?: string | null;
  subtitleLabel?: string | null;
  observation?: PlaybackDiagnosticsSnapshot;
}

export interface PlaybackDiagnosticRow {
  label: string;
  value: string;
}

export type PlaybackDiagnosticEvent =
  | { type: "plan_usable"; elapsedMs: number }
  | { type: "first_frame"; elapsedMs: number }
  | { type: "initial_buffering"; durationMs: number }
  | { type: "stall"; durationMs: number }
  | { type: "fallback" }
  | { type: "seek"; outcome: "requested" | "accepted" | "failed" }
  | {
      type: "seekable_handoff";
      state: "started" | "ready" | "unavailable" | "completed";
    }
  | { type: "audio_switch"; outcome: "succeeded" | "failed" }
  | {
      type: "subtitle_provider";
      outcome: "succeeded" | "failed";
      latencyMs: number;
    }
  | {
      type: "subtitle_parse";
      outcome: "succeeded" | "failed";
      cueCount?: number;
    }
  | {
      type: "next_episode_preplan";
      outcome: "ready" | "unavailable" | "cancelled";
      elapsedMs: number;
    };

export interface PlaybackDiagnosticsSnapshot {
  timeToUsablePlanMs?: number;
  timeToFirstFrameMs?: number;
  initialBufferingMs: number;
  stallCount: number;
  stallDurationMs: number;
  fallbackCount: number;
  seeks: { requested: number; accepted: number; failed: number };
  seekableHandoff: {
    started: number;
    ready: number;
    unavailable: number;
    completed: number;
  };
  audioSwitches: { succeeded: number; failed: number };
  subtitleProviders: {
    succeeded: number;
    failed: number;
    totalLatencyMs: number;
  };
  subtitleParses: { succeeded: number; failed: number; cues: number };
  nextEpisodePreplans: {
    ready: number;
    unavailable: number;
    cancelled: number;
    totalLatencyMs: number;
  };
}

function createDiagnosticsSnapshot(): PlaybackDiagnosticsSnapshot {
  return {
    initialBufferingMs: 0,
    stallCount: 0,
    stallDurationMs: 0,
    fallbackCount: 0,
    seeks: { requested: 0, accepted: 0, failed: 0 },
    seekableHandoff: {
      started: 0,
      ready: 0,
      unavailable: 0,
      completed: 0,
    },
    audioSwitches: { succeeded: 0, failed: 0 },
    subtitleProviders: { succeeded: 0, failed: 0, totalLatencyMs: 0 },
    subtitleParses: { succeeded: 0, failed: 0, cues: 0 },
    nextEpisodePreplans: {
      ready: 0,
      unavailable: 0,
      cancelled: 0,
      totalLatencyMs: 0,
    },
  };
}

const MAX_DIAGNOSTIC_DURATION_MS = 30 * 60 * 1000;

function safeMetric(value: number) {
  return Number.isFinite(value)
    ? Math.min(MAX_DIAGNOSTIC_DURATION_MS, Math.max(0, Math.round(value)))
    : 0;
}

/**
 * Maps only the playback milestones that answer the first-frame/stall
 * reliability question to a bounded Sentry breadcrumb. The recorder keeps
 * the complete runtime snapshot for the diagnostics panel; this smaller
 * contract deliberately omits seeks, track labels, source identity, and
 * media details so normal playback cannot produce a high-volume telemetry
 * stream.
 */
export function toPlaybackDiagnosticBreadcrumb(
  event: PlaybackDiagnosticEvent,
): StreamerBreadcrumbInput | null {
  switch (event.type) {
    case "plan_usable":
      return {
        category: "playback",
        message: "playback.plan_usable",
        data: { elapsedMs: safeMetric(event.elapsedMs) },
      };
    case "first_frame":
      return {
        category: "playback",
        message: "playback.first_frame",
        data: { elapsedMs: safeMetric(event.elapsedMs) },
      };
    case "initial_buffering":
      return {
        category: "playback",
        message: "playback.initial_buffering",
        data: { durationMs: safeMetric(event.durationMs) },
      };
    case "stall":
      return {
        category: "playback",
        message: "playback.stall",
        level: "warning",
        data: { durationMs: safeMetric(event.durationMs) },
      };
    case "fallback":
      return {
        category: "playback",
        message: "playback.fallback",
        level: "warning",
      };
    default:
      return null;
  }
}

/**
 * Accepts only a closed set of numeric and enumerated events. There is no
 * field for URLs, source objects, provider payloads, credentials or hashes.
 */
export class PlaybackDiagnosticsRecorder {
  private readonly metrics = createDiagnosticsSnapshot();

  record(event: PlaybackDiagnosticEvent) {
    switch (event.type) {
      case "plan_usable":
        this.metrics.timeToUsablePlanMs = safeMetric(event.elapsedMs);
        break;
      case "first_frame":
        this.metrics.timeToFirstFrameMs = safeMetric(event.elapsedMs);
        break;
      case "initial_buffering":
        this.metrics.initialBufferingMs += safeMetric(event.durationMs);
        break;
      case "stall":
        this.metrics.stallCount += 1;
        this.metrics.stallDurationMs += safeMetric(event.durationMs);
        break;
      case "fallback":
        this.metrics.fallbackCount += 1;
        break;
      case "seek":
        this.metrics.seeks[event.outcome] += 1;
        break;
      case "seekable_handoff":
        this.metrics.seekableHandoff[event.state] += 1;
        break;
      case "audio_switch":
        this.metrics.audioSwitches[event.outcome] += 1;
        break;
      case "subtitle_provider":
        this.metrics.subtitleProviders[event.outcome] += 1;
        this.metrics.subtitleProviders.totalLatencyMs += safeMetric(
          event.latencyMs,
        );
        break;
      case "subtitle_parse":
        this.metrics.subtitleParses[event.outcome] += 1;
        this.metrics.subtitleParses.cues += safeMetric(event.cueCount ?? 0);
        break;
      case "next_episode_preplan":
        this.metrics.nextEpisodePreplans[event.outcome] += 1;
        this.metrics.nextEpisodePreplans.totalLatencyMs += safeMetric(
          event.elapsedMs,
        );
        break;
    }
  }

  snapshot(): PlaybackDiagnosticsSnapshot {
    return {
      ...this.metrics,
      seeks: { ...this.metrics.seeks },
      seekableHandoff: { ...this.metrics.seekableHandoff },
      audioSwitches: { ...this.metrics.audioSwitches },
      subtitleProviders: { ...this.metrics.subtitleProviders },
      subtitleParses: { ...this.metrics.subtitleParses },
      nextEpisodePreplans: { ...this.metrics.nextEpisodePreplans },
    };
  }
}

function wholeSeconds(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Privacy-safe by construction: callers provide only classifications and
 * numeric media state. Raw source objects, URLs, magnets, hashes, bridge
 * addresses, and provider response objects are not accepted.
 */
export function buildPlaybackDiagnostics(
  input: PlaybackDiagnosticsInput,
): PlaybackDiagnosticRow[] {
  const rows: PlaybackDiagnosticRow[] = [
    { label: "Engine", value: input.engineType || "unknown" },
    { label: "Source", value: input.sourceKind },
    { label: "State", value: input.runtimeState },
    { label: "Seekable", value: input.seekable ? "yes" : "no" },
    {
      label: "Timeline",
      value: `${wholeSeconds(input.positionSeconds)}s / ${wholeSeconds(
        input.durationSeconds,
      )}s`,
    },
    {
      label: "Buffered",
      value: `${wholeSeconds(input.bufferedSeconds)}s`,
    },
    { label: "Audio", value: input.audioLabel || "automatic" },
    { label: "Subtitles", value: input.subtitleLabel || "off" },
  ];
  if (!input.observation) return rows;

  const observation = input.observation;
  rows.push(
    {
      label: "Plan usable",
      value:
        observation.timeToUsablePlanMs === undefined
          ? "pending"
          : `${observation.timeToUsablePlanMs}ms`,
    },
    {
      label: "First frame",
      value:
        observation.timeToFirstFrameMs === undefined
          ? "pending"
          : `${observation.timeToFirstFrameMs}ms`,
    },
    {
      label: "Stalls",
      value: `${observation.stallCount} · ${observation.stallDurationMs}ms`,
    },
    { label: "Fallbacks", value: String(observation.fallbackCount) },
    {
      label: "Seeks",
      value: `${observation.seeks.accepted}/${observation.seeks.requested} accepted · ${observation.seeks.failed} failed`,
    },
    {
      label: "Handoff",
      value: `${observation.seekableHandoff.completed} completed · ${observation.seekableHandoff.unavailable} unavailable`,
    },
    {
      label: "Subtitle providers",
      value: `${observation.subtitleProviders.succeeded} ready · ${observation.subtitleProviders.failed} failed`,
    },
  );
  return rows;
}
