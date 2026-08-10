/**
 * Bounded, process-level planner outcome counters. These values intentionally
 * do not contain user, request, title, candidate, source, or URL identity.
 */
export const plannerTelemetryCounterNames = [
  "v3_success",
  "v3_no_eligible_route",
  "v3_unsupported_fallback",
  "v2_legacy_selection",
] as const;

export type PlannerTelemetryCounterName =
  (typeof plannerTelemetryCounterNames)[number];

export type PlannerTelemetryMetricsCounters = Record<
  PlannerTelemetryCounterName,
  number
>;

export interface PlannerTelemetryMetricsV1 {
  protocolVersion: 1;
  sampledAt: string;
  counters: PlannerTelemetryMetricsCounters;
}

/**
 * A bounded signal sent on the existing v2 compatibility request. Keeping the
 * signal in a header avoids a second telemetry request during a recovery path.
 */
export const playbackPlannerCompatibilitySignals = [
  "v3-unsupported-fallback",
  "legacy-negotiated",
] as const;

export type PlaybackPlannerCompatibilitySignal =
  (typeof playbackPlannerCompatibilitySignals)[number];

export const PLAYBACK_PLANNER_COMPATIBILITY_HEADER =
  "X-Playback-Planner-Compatibility";

export interface PlaybackPlanDeprecationMetadata {
  status: "deprecated";
  replacementVersion: 3;
}
