import type { Context } from "hono";
import {
  PLAYBACK_PLANNER_COMPATIBILITY_HEADER,
  playbackPlanSchema,
  playbackPlanV3Schema,
  playbackPlannerCompatibilitySignalSchema,
} from "@streamer/shared";
import { playbackPlannerService } from "./playback-planner.service.js";
import { playbackPlannerV3Service } from "./playback-planner-v3.service.js";
import {
  getPlannerTelemetryMetricsSnapshot,
  recordPlannerV2Selection,
  recordPlannerV3Outcome,
} from "./planner-telemetry.service.js";

export class PlaybackController {
  async plan(c: Context) {
    const body = (c.req as any).valid("json");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const plan = await playbackPlannerService.createPlan(
      user.userId,
      body,
      requestId,
      { signal: c.req.raw.signal },
    );

    const compatibilitySignal =
      playbackPlannerCompatibilitySignalSchema.safeParse(
        c.req.header(PLAYBACK_PLANNER_COMPATIBILITY_HEADER),
      );
    recordPlannerV2Selection(
      compatibilitySignal.success ? compatibilitySignal.data : undefined,
    );

    return c.json(
      playbackPlanSchema.parse({
        ...plan,
        deprecation: {
          status: "deprecated",
          replacementVersion: 3,
        },
      }),
    );
  }

  async planV3(c: Context) {
    const body = (c.req as any).valid("json");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const plan = await playbackPlannerV3Service.createPlanV3(
      user.userId,
      body,
      requestId,
      { signal: c.req.raw.signal },
    );

    recordPlannerV3Outcome(plan.state);
    return c.json(playbackPlanV3Schema.parse(plan));
  }

  metrics(c: Context) {
    return c.json(getPlannerTelemetryMetricsSnapshot());
  }
}

export const playbackController = new PlaybackController();
