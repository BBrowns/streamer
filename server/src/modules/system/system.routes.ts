import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { featureFlags } from "../feature-flag/feature-flag.service.js";

export const systemRouter = new OpenAPIHono();

const HealthResponseSchema = z
  .object({
    status: z.string().openapi({ example: "ok" }),
    db: z.string().openapi({ example: "connected" }),
    timestamp: z.string().openapi({ example: "2026-05-16T09:00:00Z" }),
    features: z
      .record(z.boolean())
      .openapi({ example: { "new-player": true } }),
    uptime: z.number().openapi({ example: 3600 }),
  })
  .openapi("HealthResponse");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "Returns the health status of the application",
    },
    503: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            db: z.string(),
          }),
        },
      },
      description: "Database is disconnected",
    },
  },
});

systemRouter.openapi(healthRoute, async (c) => {
  try {
    // Lightweight query to verify DB connectivity
    await import("../../prisma/client.js").then(
      (m) => m.prisma.$queryRaw`SELECT 1`,
    );
    return c.json(
      {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
        features: featureFlags.getAll(),
        uptime: process.uptime(),
      },
      200,
    );
  } catch (err) {
    return c.json({ status: "error", db: "disconnected" }, 503);
  }
});

export const resilienceMetricsRoute = createRoute({
  method: "get",
  path: "/api/aggregator/resilience",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.record(z.any()).openapi({
            title: "ResilienceMetrics",
            example: {
              "addon-1": {
                circuitBreaker: "Closed",
                retries: 5,
                timeouts: 2,
              },
            },
          }),
        },
      },
      description:
        "Returns circuit breaker and resilience metrics for all add-ons",
    },
  },
});

systemRouter.openapi(resilienceMetricsRoute, async (c) => {
  const { resilienceRegistry } = await import("../aggregator/resilience.js");
  return c.json(resilienceRegistry.getAllMetrics());
});
