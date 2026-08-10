import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  playbackPlanRequestSchema,
  playbackPlanV3RequestSchema,
} from "@streamer/shared";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { playbackController } from "./playback.controller.js";

export const playbackRouter = new Hono<HonoEnv>()
  .post(
    "/plan/v3",
    authMiddleware,
    zValidator("json", playbackPlanV3RequestSchema),
    (c) => playbackController.planV3(c),
  )
  .post(
    "/plan",
    authMiddleware,
    zValidator("json", playbackPlanRequestSchema),
    (c) => playbackController.plan(c),
  );
