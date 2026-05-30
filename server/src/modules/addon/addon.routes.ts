import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { addonController } from "./addon.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { addonCatalogSchema, addonInstallSchema } from "@streamer/shared";

export const addonRouter = new Hono();

addonRouter.use("*", authMiddleware);
addonRouter.get("", (c) => addonController.list(c));
addonRouter.post("", zValidator("json", addonInstallSchema), (c) =>
  addonController.install(c),
);
addonRouter.get(
  "/:addonId/catalog/:type/:catalogId",
  zValidator(
    "param",
    addonCatalogSchema.pick({
      addonId: true,
      type: true,
      catalogId: true,
    }),
  ),
  zValidator(
    "query",
    addonCatalogSchema.omit({
      addonId: true,
      type: true,
      catalogId: true,
    }),
  ),
  (c) => addonController.catalog(c),
);
addonRouter.delete("/:id", (c) => addonController.uninstall(c));
