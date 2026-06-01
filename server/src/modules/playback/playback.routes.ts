import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { playbackPlanRequestSchema } from "@streamer/shared";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { playbackController } from "./playback.controller.js";

export const playbackRouter = new Hono<HonoEnv>().post(
  "/plan",
  authMiddleware,
  zValidator("json", playbackPlanRequestSchema),
  (c) => playbackController.plan(c),
);
