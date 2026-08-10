import { describe, expect, it } from "vitest";
import {
  playbackPlannerCompatibilitySignalSchema,
  plannerTelemetryMetricsV1Schema,
} from "../src";

describe("planner telemetry contracts", () => {
  it("accepts the bounded compatibility signals", () => {
    expect(
      playbackPlannerCompatibilitySignalSchema.parse("v3-unsupported-fallback"),
    ).toBe("v3-unsupported-fallback");
    expect(
      playbackPlannerCompatibilitySignalSchema.parse("legacy-negotiated"),
    ).toBe("legacy-negotiated");
  });

  it("accepts only privacy-safe aggregate metrics", () => {
    const metrics = {
      protocolVersion: 1,
      sampledAt: "2026-08-10T12:00:00.000Z",
      counters: {
        v3_success: 12,
        v3_no_eligible_route: 3,
        v3_unsupported_fallback: 2,
        v2_legacy_selection: 4,
      },
    };

    expect(plannerTelemetryMetricsV1Schema.parse(metrics)).toEqual(metrics);
    expect(
      plannerTelemetryMetricsV1Schema.safeParse({
        ...metrics,
        counters: { ...metrics.counters, userId: 1 },
      }).success,
    ).toBe(false);
  });
});
