import { Hono } from "hono";
import { addonController } from "./addon.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

export const addonRouter = new Hono();

addonRouter.use("*", authMiddleware);
addonRouter.get("", (c) => addonController.list(c));
addonRouter.post("", (c) => addonController.install(c));
addonRouter.delete("/:id", (c) => addonController.uninstall(c));
