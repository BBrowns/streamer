import { PrismaClient } from "@prisma/client";
import { logger } from "../config/logger.js";

export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "info" },
    { emit: "stdout", level: "warn" },
    { emit: "stdout", level: "error" },
  ],
});

prisma.$on("query", (e) => {
  if (e.duration > 100) {
    logger.warn(
      { query: e.query, params: e.params, durationMs: e.duration },
      "Slow database query detected",
    );
  } else if (process.env.LOG_LEVEL === "debug") {
    logger.debug({ query: e.query, durationMs: e.duration }, "Database query");
  }
});
