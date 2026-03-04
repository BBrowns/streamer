import type { Context } from "hono";
import { aggregatorService } from "./aggregator.service.js";

export class AggregatorController {
  async getCatalog(c: Context) {
    const type = c.req.param("type");
    const search = c.req.query("search");
    const skipStr = c.req.query("skip");
    const skip = skipStr ? parseInt(skipStr, 10) : undefined;
    const user = c.get("user") as any;
    const requestId = c.get("requestId") as string;

    const metas = await aggregatorService.getCatalog(
      user.userId,
      type,
      requestId,
      search,
      skip,
    );

    return c.json({ metas });
  }

  async getMeta(c: Context) {
    const type = c.req.param("type");
    const id = c.req.param("id");
    const user = c.get("user") as any;
    const requestId = c.get("requestId") as string;

    const meta = await aggregatorService.getMeta(
      user.userId,
      type,
      id,
      requestId,
    );

    if (!meta) {
      return c.json({ error: "Metadata not found" }, 404);
    }

    return c.json({ meta });
  }

  async getStreams(c: Context) {
    const type = c.req.param("type");
    const id = c.req.param("id");
    const user = c.get("user") as any;
    const requestId = c.get("requestId") as string;

    const streams = await aggregatorService.getStreams(
      user.userId,
      type,
      id,
      requestId,
    );

    return c.json({ streams });
  }

  async resolveStream(c: Context) {
    const type = c.req.param("type");
    const id = c.req.param("id");
    const infoHash = c.req.param("infoHash");
    const user = c.get("user") as any;
    const requestId = c.get("requestId") as string;

    const resolved = await aggregatorService.resolveStream(
      user.userId,
      type,
      id,
      infoHash,
      requestId,
    );

    return c.json({ resolved });
  }

  async search(c: Context) {
    const query = c.req.query("q");
    if (!query || query.trim().length === 0) {
      return c.json({ metas: [] });
    }
    const user = c.get("user") as any;
    const requestId = c.get("requestId") as string;

    const metas = await aggregatorService.search(
      user.userId,
      query.trim(),
      requestId,
    );

    return c.json({ metas });
  }
}

export const aggregatorController = new AggregatorController();
