import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { sessionController } from "./session.controller.js";
import { zValidator } from "@hono/zod-validator";
import {
  playbackSessionUpdateSchema,
  remoteSessionCommandSchema,
} from "@streamer/shared";

export const sessionRouter = new Hono<HonoEnv>();

sessionRouter.use("*", authMiddleware);

sessionRouter.get("/", sessionController.getSessions);
sessionRouter.post(
  "/update",
  zValidator("json", playbackSessionUpdateSchema),
  sessionController.updateSession,
);
sessionRouter.post(
  "/command",
  zValidator("json", remoteSessionCommandSchema),
  sessionController.sendCommand,
);
sessionRouter.delete("/remove", sessionController.removeSession);
