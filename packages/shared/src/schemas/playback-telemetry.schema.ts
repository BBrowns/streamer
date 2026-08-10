import { z } from "zod";
import { playbackPlannerCompatibilitySignals } from "../types/playback-telemetry";

export const playbackPlannerCompatibilitySignalSchema = z.enum(
  playbackPlannerCompatibilitySignals,
);

export const plannerTelemetryMetricsV1Schema = z
  .object({
    protocolVersion: z.literal(1),
    sampledAt: z.string().datetime({ offset: true }),
    counters: z
      .object({
        v3_success: z.number().int().nonnegative(),
        v3_no_eligible_route: z.number().int().nonnegative(),
        v3_unsupported_fallback: z.number().int().nonnegative(),
        v2_legacy_selection: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
