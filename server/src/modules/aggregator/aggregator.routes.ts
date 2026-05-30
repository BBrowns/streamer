import { Hono } from "hono";
import { HonoEnv } from "../../types/hono.js";
import { zValidator } from "@hono/zod-validator";
import { aggregatorController } from "./aggregator.controller.js";
import { catalogRateLimiter } from "../../middleware/rateLimiter.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import {
  aggregatorSearchSchema,
  aggregatorCatalogSchema,
  aggregatorMetaSchema,
  aggregatorStreamSchema,
  aggregatorResolveSchema,
  aggregatorResolveBulkSchema,
} from "@streamer/shared";

export const aggregatorRouter = new Hono<HonoEnv>();

const routes = aggregatorRouter
  .get(
    "/search",
    authMiddleware,
    zValidator("query", aggregatorSearchSchema),
    (c) => aggregatorController.search(c),
  )
  .get(
    "/catalog/:type",
    authMiddleware,
    catalogRateLimiter,
    zValidator("param", aggregatorCatalogSchema.pick({ type: true })),
    zValidator("query", aggregatorCatalogSchema.omit({ type: true })),
    (c) => aggregatorController.getCatalog(c),
  )
  .get(
    "/meta/:type/:id",
    authMiddleware,
    zValidator("param", aggregatorMetaSchema),
    (c) => aggregatorController.getMeta(c),
  )
  .get(
    "/stream/resolve/:type/:id/:infoHash",
    authMiddleware,
    zValidator("param", aggregatorResolveSchema),
    (c) => aggregatorController.resolveStream(c),
  )
  .get(
    "/stream/:type/:id",
    authMiddleware,
    zValidator("param", aggregatorStreamSchema),
    (c) => aggregatorController.getStreams(c),
  )
  .post(
    "/stream/resolve-bulk",
    authMiddleware,
    zValidator("json", aggregatorResolveBulkSchema),
    (c) => aggregatorController.resolveStreamsBulk(c),
  )
  .get("/resilience", (c) => aggregatorController.getResilienceMetrics(c));

export type AggregatorRoutes = typeof routes;
