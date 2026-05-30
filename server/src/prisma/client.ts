import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "../config/logger.js";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "info" },
    { emit: "stdout", level: "warn" },
    { emit: "stdout", level: "error" },
  ],
});

prisma.$on("query", (e: any) => {
  if (e.duration > 100) {
    logger.warn(
      { query: e.query, params: e.params, durationMs: e.duration },
      "Slow database query detected",
    );
  } else if (process.env.LOG_LEVEL === "debug") {
    logger.debug({ query: e.query, durationMs: e.duration }, "Database query");
  }
});
