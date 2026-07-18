import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { serverBuildMetadata } from "../../config/build-metadata.js";
import { checkServerReadiness } from "../../services/readiness.service.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { aggregatorService } from "../aggregator/aggregator.service.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";

export const systemRouter = new OpenAPIHono<HonoEnv>();

const BuildMetadataSchema = z.object({
  appVersion: z.string(),
  gitSha: z.string(),
  gitShaShort: z.string(),
  buildDate: z.string(),
  buildChannel: z.string(),
  runtimeType: z.literal("server"),
  environment: z.enum(["development", "preview", "production", "test"]),
  release: z.string(),
});

const ReadinessResponseSchema = z
  .object({
    status: z.enum(["ok", "error"]),
    db: z.enum(["connected", "disconnected"]),
    timestamp: z.string(),
    features: z.record(z.string(), z.boolean()),
    uptime: z.number(),
    shuttingDown: z.boolean(),
    dependencies: z.object({
      database: z.enum(["connected", "disconnected"]),
      redis: z.enum(["connected", "unavailable", "not_configured"]),
    }),
    runtime: z.object({
      instanceMode: z.enum(["single", "multi"]),
      rateLimitStore: z.enum(["memory", "redis"]),
      emailDelivery: z.enum(["log", "smtp"]),
      trustProxyHops: z.number().int().nonnegative(),
    }),
    build: BuildMetadataSchema,
  })
  .openapi("ServerReadinessResponse");

const LivenessResponseSchema = z
  .object({
    status: z.literal("live"),
    timestamp: z.string(),
    uptime: z.number(),
    build: BuildMetadataSchema,
  })
  .openapi("ServerLivenessResponse");

const livenessRoute = createRoute({
  method: "get",
  path: "/live",
  responses: {
    200: {
      content: { "application/json": { schema: LivenessResponseSchema } },
      description: "Confirms that the server process can answer requests",
    },
  },
});

const readinessResponses = {
  200: {
    content: { "application/json": { schema: ReadinessResponseSchema } },
    description: "Required server dependencies are ready",
  },
  503: {
    content: { "application/json": { schema: ReadinessResponseSchema } },
    description: "A required dependency is unavailable or shutdown has begun",
  },
} as const;

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: readinessResponses,
});

const readinessRoute = createRoute({
  method: "get",
  path: "/ready",
  responses: readinessResponses,
});

systemRouter.openapi(livenessRoute, (c) =>
  c.json(
    {
      status: "live" as const,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      build: serverBuildMetadata,
    },
    200,
  ),
);

async function readinessHandler(c: Context) {
  const readiness = await checkServerReadiness();
  const response = {
    status: readiness.ready ? ("ok" as const) : ("error" as const),
    db: readiness.dependencies.database,
    timestamp: new Date().toISOString(),
    features: featureFlags.getAll(),
    uptime: process.uptime(),
    shuttingDown: readiness.shuttingDown,
    dependencies: readiness.dependencies,
    runtime: readiness.runtime,
    build: serverBuildMetadata,
  };
  return c.json(response, readiness.ready ? 200 : 503);
}

systemRouter.openapi(healthRoute, readinessHandler);
systemRouter.openapi(readinessRoute, readinessHandler);

export const resilienceMetricsRoute = createRoute({
  method: "get",
  path: "/api/aggregator/resilience",
  middleware: [authMiddleware],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            providers: z.array(
              z.object({
                provider: z.string(),
                metrics: z.object({
                  timeouts: z.number().int().nonnegative(),
                  retries: z.number().int().nonnegative(),
                  circuitOpens: z.number().int().nonnegative(),
                  bulkheadRejections: z.number().int().nonnegative(),
                  lastFailure: z.union([z.date(), z.string()]).nullable(),
                }),
              }),
            ),
            totals: z.object({
              timeouts: z.number().int().nonnegative(),
              retries: z.number().int().nonnegative(),
              circuitOpens: z.number().int().nonnegative(),
              bulkheadRejections: z.number().int().nonnegative(),
              lastFailure: z.union([z.date(), z.string()]).nullable(),
            }),
            truncated: z.boolean(),
          }),
        },
      },
      description: "Returns redacted resilience metrics for the current user",
    },
  },
});

systemRouter.openapi(resilienceMetricsRoute, async (c) => {
  const user = c.get("user");
  return c.json(
    await aggregatorService.getResilienceDiagnostics(user.userId),
    200,
  );
});
