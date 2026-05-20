import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./prisma/client.js";
import { traktService } from "./modules/trakt/adapters/trakt.routes.js";
import { supervisorService } from "./modules/system/supervisor.service.js";

async function main() {
  // Verify database connection
  try {
    await prisma.$connect();
    logger.info("Database connected");

    // Start Trakt background sync
    traktService.startBackgroundSync();

    // Start stream-server supervisor
    supervisorService.start();
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
        { port: info.port, env: env.nodeEnv },
        `Streamer server running on port ${info.port}`,
      );
    },
  );

  injectWebSocket(server);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    supervisorService.stop();
    traktService.stopBackgroundSync();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Unhandled startup error");
  process.exit(1);
});
