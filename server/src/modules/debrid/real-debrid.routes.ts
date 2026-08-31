import { Hono } from "hono";
import { z } from "zod";
import {
  realDebridDeviceFlowSchema,
  realDebridDevicePollSchema,
  realDebridStatusSchema,
} from "@streamer/shared";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { realDebridService } from "./real-debrid.service.js";

const flowParamSchema = z.object({ flowId: z.string().uuid() });

export const realDebridRouter = new Hono<HonoEnv>();
realDebridRouter.use("*", authMiddleware);

realDebridRouter.get("/status", async (c) => {
  const status = await realDebridService.getStatus(c.get("user").userId);
  return c.json(realDebridStatusSchema.parse(status));
});

realDebridRouter.post("/device", async (c) => {
  const flow = await realDebridService.startDeviceFlow(c.get("user").userId);
  return c.json(realDebridDeviceFlowSchema.parse(flow), 201);
});

realDebridRouter.post("/device/:flowId/poll", async (c) => {
  const params = flowParamSchema.parse({ flowId: c.req.param("flowId") });
  const result = await realDebridService.pollDeviceFlow(
    c.get("user").userId,
    params.flowId,
  );
  return c.json(realDebridDevicePollSchema.parse(result));
});

realDebridRouter.delete("/", async (c) => {
  await realDebridService.disconnect(c.get("user").userId);
  return c.body(null, 204);
});
