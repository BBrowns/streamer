import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { sessionController } from "./session.controller.js";

export const sessionRouter = new Hono<HonoEnv>();

sessionRouter.use("*", authMiddleware);

sessionRouter.get("/", sessionController.getSessions);
sessionRouter.post("/update", sessionController.updateSession);
sessionRouter.post("/command", sessionController.sendCommand);
sessionRouter.delete("/remove", sessionController.removeSession);
