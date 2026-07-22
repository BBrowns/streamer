import type { Context } from "hono";
import { addonService } from "./addon.service.js";
import { aggregatorService } from "../aggregator/aggregator.service.js";

export class AddonController {
  async install(c: Context) {
    const { transportUrl } = (c.req as any).valid("json");
    const user = c.get("user");
    const addon = await addonService.install(user.userId, transportUrl);
    aggregatorService.invalidateSearchCacheForUser(user.userId);
    aggregatorService.invalidateStreamDiscoveryCacheForUser(user.userId);
    return c.json(addon, 201);
  }

  async list(c: Context) {
    const user = c.get("user");
    const addons = await addonService.list(user.userId);
    return c.json({ addons });
  }

  async catalog(c: Context) {
    const { addonId, type, catalogId } = (c.req as any).valid("param");
    const { search, skip } = (c.req as any).valid("query");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    try {
      const metas = await aggregatorService.getAddonCatalog(
        user.userId,
        addonId,
        type,
        catalogId,
        requestId,
        search,
        skip,
      );
      return c.json({ metas });
    } catch (err: any) {
      const notFound =
        err?.message === "Add-on not installed" ||
        err?.message === "Catalog not found for add-on";
      return c.json(
        { error: err?.message || "Catalog unavailable" },
        notFound ? 404 : 400,
      );
    }
  }

  async uninstall(c: Context) {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const removed = await addonService.uninstall(user.userId, id);
    aggregatorService.removeAddonStateForUser(
      user.userId,
      removed.id,
      removed.transportUrl,
    );
    return new Response(null, { status: 204 });
  }
}

export const addonController = new AddonController();
