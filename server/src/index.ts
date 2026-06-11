import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { serverBuildMetadata } from "./config/build-metadata.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./prisma/client.js";
import { traktService } from "./modules/trakt/adapters/trakt.routes.js";
import { supervisorService } from "./modules/system/supervisor.service.js";
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
    logger.fatal({ err }, "Failed to connect to database");
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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    supervisorService.stop();
    traktService.stopBackgroundSync();
    await prisma.$disconnect();
    await flushServerSentry();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(async (err) => {
  logger.fatal({ err }, "Unhandled startup error");
  captureServerException(err, { component: "server-startup" });
  await flushServerSentry();
  process.exit(1);
});
