import type { Context } from "hono";
import { playbackPlanSchema, playbackPlanV3Schema } from "@streamer/shared";
import { playbackPlannerService } from "./playback-planner.service.js";
import { playbackPlannerV3Service } from "./playback-planner-v3.service.js";

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

    return c.json(playbackPlanSchema.parse(plan));
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

    return c.json(playbackPlanV3Schema.parse(plan));
  }
}

export const playbackController = new PlaybackController();
