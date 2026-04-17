import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { sessionController } from "./session.controller.js";

export const sessionRouter = new Hono<{ Variables: { userId: string } }>();

sessionRouter.use("*", authMiddleware);

sessionRouter.get("/", sessionController.getSessions);
sessionRouter.post("/update", sessionController.updateSession);
sessionRouter.post("/command", sessionController.sendCommand);
sessionRouter.delete("/remove", sessionController.removeSession);
