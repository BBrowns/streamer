import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { serverBuildMetadata } from "./config/build-metadata.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./prisma/client.js";
import { traktService } from "./modules/trakt/adapters/trakt.routes.js";
import { supervisorService } from "./modules/system/supervisor.service.js";
import { connectRedis, disconnectRedis } from "./services/redis.js";
import { markServerShuttingDown } from "./services/readiness.service.js";
import {
  captureServerException,
  flushServerSentry,
  initServerSentry,
} from "./services/sentry.service.js";

initServerSentry();

async function main() {
  // Verify database connection
  try {
    await prisma.$connect();
    logger.info("Database connected");

    const redisStatus = await connectRedis();
    if (env.instanceMode === "multi" && redisStatus !== "connected") {
      throw new Error(
        "Redis must be available before a multi-instance server can start",
      );
    }
    if (env.redisUrl && redisStatus !== "connected") {
      logger.warn(
        { instanceMode: env.instanceMode },
        "Redis is configured but unavailable; readiness will remain unhealthy",
      );
    }

    // Start Trakt background sync
    traktService.startBackgroundSync();

    if (env.bridgeSupervisorEnabled) {
      void supervisorService.start().catch((err) => {
        logger.error({ err }, "[supervisor] Failed to start stream-server");
        captureServerException(err, { component: "stream-server-supervisor" });
      });
    } else {
      logger.info(
        "[supervisor] Stream-server supervisor disabled; use the desktop bridge or npm run dev:stream-server.",
      );
    }
  } catch (err) {
    logger.fatal({ err }, "Required startup dependency check failed");
    process.exit(1);
  }

  const app = createApp();
  const { injectWebSocket } = await import("./config/websocket.js");

  const server = serve(
    {
      fetch: app.fetch,
      port: env.port,
    },
    (info) => {
      logger.info(
        { port: info.port, env: env.nodeEnv, build: serverBuildMetadata },
        `Streamer server running on port ${info.port}`,
      );
    },
  );

  server.on("connection", (socket) => {
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET" || err.code === "EPIPE") {
        logger.debug({ err }, "Client socket closed unexpectedly");
        return;
      }

      logger.warn({ err }, "Client socket error");
    });
  });

  server.on("clientError", (err: NodeJS.ErrnoException, socket) => {
    if (err.code !== "ECONNRESET" && err.code !== "EPIPE") {
      logger.warn({ err }, "HTTP client error");
    }

    if (!socket.destroyed) {
      socket.destroy();
    }
  });

  injectWebSocket(server);

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: string) => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      logger.info({ signal }, "Shutting down gracefully...");
      markServerShuttingDown();
      supervisorService.stop();
      traktService.stopBackgroundSync();

      const forceCloseTimer = setTimeout(() => {
        logger.warn(
          { timeoutMs: env.shutdownTimeoutMs },
          "Graceful HTTP shutdown timed out; closing remaining connections",
        );
        if (
          "closeAllConnections" in server &&
          typeof server.closeAllConnections === "function"
        ) {
          server.closeAllConnections();
        }
      }, env.shutdownTimeoutMs);
      forceCloseTimer.unref();

      await new Promise<void>((resolve) => {
        server.close((error) => {
          if (error)
            logger.warn({ error }, "HTTP server close reported an error");
          resolve();
        });
      });
      clearTimeout(forceCloseTimer);

      const cleanupResults = await Promise.allSettled([
        disconnectRedis(),
        prisma.$disconnect(),
        flushServerSentry(),
      ]);
      if (cleanupResults.some((result) => result.status === "rejected")) {
        logger.warn("One or more shutdown cleanup operations failed");
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    })();

    return shutdownPromise;
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(async (err) => {
  logger.fatal({ err }, "Unhandled startup error");
  captureServerException(err, { component: "server-startup" });
  await flushServerSentry();
  process.exit(1);
});
