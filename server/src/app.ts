import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/error.middleware.js";
import {
  rateLimiter,
  authRateLimiter,
  catalogRateLimiter,
} from "./middleware/rateLimiter.middleware.js";
import { featureFlags } from "./modules/feature-flag/feature-flag.service.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { addonRouter } from "./modules/addon/addon.routes.js";
import { aggregatorRouter } from "./modules/aggregator/aggregator.routes.js";
import { libraryRouter } from "./modules/library/adapters/library.routes.js";

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use("*", secureHeaders());
  app.use("*", requestId());
  app.use(
    "*",
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
      exposeHeaders: ["Content-Length", "X-Request-Id"],
      maxAge: 600,
    }),
  );

  // Custom logger integration with Pino
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info(
      {
        method: c.req.method,
        url: c.req.url,
        status: c.res.status,
        responseTime: `${ms}ms`,
        requestId: c.get("requestId"),
      },
      "Request",
    );
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      features: featureFlags.getAll(),
    });
  });

  // API routes
  app.route("/api/auth", authRouter);
  app.route("/api/addons", addonRouter);
  app.route("/api/library", libraryRouter);
  app.route("/api", aggregatorRouter);

  // Error handler
  app.onError(errorHandler);

  return app;
}
