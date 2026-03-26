import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "../../../middleware/auth.middleware.js";
import { PrismaTraktRepository } from "./prisma-trakt.repository.js";
import { TraktClient } from "./trakt-client.js";
import { TraktService } from "../trakt.service.js";

const traktRepo = new PrismaTraktRepository();
const traktClient = new TraktClient();
export const traktService = new TraktService(traktClient, traktRepo);

export const traktRouter = new Hono();

// All trakt routes require authentication
traktRouter.use("*", authMiddleware);

/** POST /api/trakt/connect - Connect Trakt account with OAuth code */
traktRouter.post("/connect", async (c) => {
  const { code, redirectUri } = (await c.req.json()) as {
    code: string;
    redirectUri?: string;
  };
  const userId = c.get("userId" as any) as string;

  if (!code) return c.json({ error: "Code is required" }, 400);

  await traktService.connectAccount(userId, code, redirectUri);
  return c.json({ status: "connected" });
});

/** DELETE /api/trakt/disconnect - Disconnect Trakt account */
traktRouter.delete("/disconnect", async (c) => {
  const userId = c.get("userId" as any) as string;
  await traktService.disconnectAccount(userId);
  return c.json({ status: "disconnected" });
});

/** GET /api/trakt/status - Check if Trakt account is connected */
traktRouter.get("/status", async (c) => {
  const userId = c.get("userId" as any) as string;
  const token = await traktService.getValidToken(userId);
  return c.json({ connected: !!token });
});

/** POST /api/trakt/scrobble/:action - Scrobble playback status */
traktRouter.post("/scrobble/:action", async (c) => {
  const action = c.req.param("action") as "start" | "pause" | "stop";
  const data = await c.req.json();
  const userId = c.get("userId" as any) as string;

  if (!["start", "pause", "stop"].includes(action)) {
    return c.json({ error: "Invalid action" }, 400);
  }

  await traktService.scrobble(userId, action, data);
  return c.json({ status: "success" });
});
