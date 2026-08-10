import {
  plannerTelemetryMetricsV1Schema,
  type PlaybackPlanState,
  type PlannerTelemetryMetricsCounters,
  type PlannerTelemetryMetricsV1,
  type PlaybackPlannerCompatibilitySignal,
} from "@streamer/shared";

function createEmptyCounters(): PlannerTelemetryMetricsCounters {
  return {
    v3_success: 0,
    v3_no_eligible_route: 0,
    v3_unsupported_fallback: 0,
    v2_legacy_selection: 0,
  };
}

const counters = createEmptyCounters();

/**
 * Process-local planner outcome evidence. Counters deliberately have no
 * request, account, title, candidate, source, URL, or error-message labels.
 */
export function recordPlannerV3Outcome(state: PlaybackPlanState) {
  counters[state === "ready" ? "v3_success" : "v3_no_eligible_route"] += 1;
}

export function recordPlannerV2Selection(
  compatibilitySignal?: PlaybackPlannerCompatibilitySignal,
) {
  counters.v2_legacy_selection += 1;
  if (compatibilitySignal === "v3-unsupported-fallback") {
    counters.v3_unsupported_fallback += 1;
  }
}

export function getPlannerTelemetryMetricsSnapshot(
  now = Date.now(),
): PlannerTelemetryMetricsV1 {
  return plannerTelemetryMetricsV1Schema.parse({
    protocolVersion: 1,
    sampledAt: new Date(now).toISOString(),
    counters: { ...counters },
  });
}

export function __resetPlannerTelemetryForTests() {
  Object.assign(counters, createEmptyCounters());
}
