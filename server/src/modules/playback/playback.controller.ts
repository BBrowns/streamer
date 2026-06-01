import type { Context } from "hono";
import { playbackPlannerService } from "./playback-planner.service.js";

export class PlaybackController {
  async plan(c: Context) {
    const body = (c.req as any).valid("json");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const plan = await playbackPlannerService.createPlan(
      user.userId,
      body,
      requestId,
    );

    return c.json(plan);
  }
}

export const playbackController = new PlaybackController();
