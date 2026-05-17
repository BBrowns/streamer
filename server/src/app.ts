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
import { requestContextStorage } from "./utils/request-context.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { addonRouter } from "./modules/addon/addon.routes.js";
import { aggregatorRouter } from "./modules/aggregator/aggregator.routes.js";
import { libraryRouter } from "./modules/library/adapters/library.routes.js";
import { traktRouter } from "./modules/trakt/adapters/trakt.routes.js";
import { notificationRouter } from "./modules/notification/notification.routes.js";
import { syncRouter } from "./modules/sync/sync.routes.js";
import { sessionRouter } from "./modules/sessions/session.routes.js";
import { docsRouter } from "./modules/docs/docs.routes.js";
import { systemRouter } from "./modules/system/system.routes.js";

import { initWebSockets } from "./config/websocket.js";

export function createApp() {
  const app = new Hono();
  initWebSockets(app);

  // Request context middleware (Correlation ID)
  app.use("*", async (c, next) => {
    const requestId =
      c.get("requestId") || c.req.header("X-Request-Id") || crypto.randomUUID();
    return requestContextStorage.run({ requestId }, () => next());
  });

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

  // API and System routes
  const routes = app
    .route("/", systemRouter)
    .route("/api/auth", authRouter)
    .route("/api/addons", addonRouter)
    .route("/api/library", libraryRouter)
    .route("/api/trakt", traktRouter)
    .route("/api/notifications", notificationRouter)
    .route("/api/sync", syncRouter)
    .route("/api/sessions", sessionRouter)
    .route("/api", aggregatorRouter)
    .route("/api/docs", docsRouter);

  // Error handler
  app.onError(errorHandler);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
