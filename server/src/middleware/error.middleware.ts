import type { Context } from "hono";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get("requestId") || "unknown";

  if (err instanceof AppError) {
    logger.warn(
      { requestId, statusCode: err.statusCode, error: err.message },
      "Application error",
    );
    return c.json(
      {
        error: err.message,
        requestId,
      },
      err.statusCode as any,
    );
  }

  if (err.name === "ZodError" || err instanceof ZodError) {
    const zodError = err as ZodError;
    logger.warn({ requestId, issues: zodError.issues }, "Validation error");
    return c.json(
      {
        error: "Validation failed",
        details: zodError.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        requestId,
      },
      400,
    );
  }

  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    logger.warn({ requestId, error: err.message }, "Malformed JSON request");
    return c.json(
      {
        error: "Invalid JSON payload",
        requestId,
      },
      400,
    );
  }

  logger.error({ err, requestId }, "Unhandled error");

  if (err.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as any;
    if (prismaErr.code === "P2003") {
      return c.json(
        {
          error: "Unauthorized or related record not found",
          requestId,
        },
        401,
      );
    }
    if (prismaErr.code === "P2025") {
      return c.json(
        {
          error: "Record not found",
          requestId,
        },
        404,
      );
    }
  }

  return c.json(
    {
      error: "Internal server error",
      requestId,
    },
    500,
  );
}
