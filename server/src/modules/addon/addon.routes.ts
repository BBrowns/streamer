import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { addonController } from "./addon.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { addonInstallSchema } from "@streamer/shared";

export const addonRouter = new Hono();

addonRouter.use("*", authMiddleware);
addonRouter.get("", (c) => addonController.list(c));
addonRouter.post("", zValidator("json", addonInstallSchema), (c) =>
  addonController.install(c),
);
addonRouter.delete("/:id", (c) => addonController.uninstall(c));
