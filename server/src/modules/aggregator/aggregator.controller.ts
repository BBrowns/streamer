import type { Context } from "hono";
import { env } from "../../config/env.js";
import { aggregatorService } from "./aggregator.service.js";
import { resilienceRegistry } from "./resilience.js";
import { SessionService } from "../auth/session.service.js";

export class AggregatorController {
  async getCatalog(c: Context) {
    const { type } = (c.req as any).valid("param");
    const { search, skip } = (c.req as any).valid("query");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

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
    const { type, id } = (c.req as any).valid("param");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

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
    const { type, id } = (c.req as any).valid("param");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const streams = await aggregatorService.getStreams(
      user.userId,
      type,
      id,
      requestId,
    );

    return c.json({ streams });
  }

  async resolveStream(c: Context) {
    const { type, id, infoHash } = (c.req as any).valid("param");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const deviceId = c.req.header("X-Device-Id") || "unknown";

    // Track active session heartbeat
    const sessionCount = await SessionService.heartbeat(
      user.userId,
      deviceId,
      c.req.header("X-Forwarded-For") || "127.0.0.1",
      c.req.header("User-Agent"),
    );

    // Enforcement: Check if session limit is reached
    if (sessionCount > env.maxConcurrentSessions) {
      return c.json(
        {
          error: "Device Limit Reached",
          message: `Your account is active on ${sessionCount} devices. The limit is ${env.maxConcurrentSessions}. Please close other sessions and try again.`,
        },
        403,
      );
    }

    const resolved = await aggregatorService.resolveStream(
      user.userId,
      type,
      id,
      infoHash,
      requestId,
    );

    return c.json({ resolved });
  }

  async resolveStreamsBulk(c: Context) {
    const { type, id, infoHashes } = (c.req as any).valid("json");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const deviceId = c.req.header("X-Device-Id") || "unknown";

    // Track active session heartbeat
    const sessionCount = await SessionService.heartbeat(
      user.userId,
      deviceId,
      c.req.header("X-Forwarded-For") || "127.0.0.1",
      c.req.header("User-Agent"),
    );

    // Enforcement: Check if session limit is reached
    if (sessionCount > env.maxConcurrentSessions) {
      return c.json(
        {
          error: "Device Limit Reached",
          message: `Your account is active on ${sessionCount} devices. The limit is ${env.maxConcurrentSessions}. Please close other sessions and try again.`,
        },
        403,
      );
    }

    const resolved = await aggregatorService.resolveStreamsBulk(
      user.userId,
      type,
      id,
      infoHashes,
      requestId,
    );

    return c.json({ resolved });
  }

  async search(c: Context) {
    const { q } = (c.req as any).valid("query");
    const user = c.get("user");
    const requestId = c.get("requestId") ?? "";

    const result = await aggregatorService.searchWithProvenance(
      user.userId,
      q.trim(),
      requestId,
    );

    return c.json(result);
  }

  async getResilienceMetrics(c: Context) {
    const requestId = c.get("requestId");
    return c.json(resilienceRegistry.getAllMetrics());
  }
}

export const aggregatorController = new AggregatorController();
