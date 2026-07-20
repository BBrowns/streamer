import type { Context } from "hono";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { captureServerException } from "../services/sentry.service.js";

/**
 * A short retry window gives a local database (for example Docker Desktop
 * restarting) time to recover without encouraging clients to immediately
 * retry every failed request.
 */
export const DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

const TRANSIENT_PRISMA_DATABASE_CODES = new Set([
  "P1001", // Database server cannot be reached.
  "P1002", // Database server connection timed out.
  "P1008", // Database operation timed out.
  "P1017", // Server closed the connection.
  "P2024", // Timed out waiting for a connection from the pool.
]);

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  errorCode?: unknown;
  cause?: unknown;
};

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === "object" && value !== null;
}

/**
 * Recognise only transient database connectivity failures. Configuration,
 * schema, and authorization errors must keep their normal error behaviour so
 * a deployment mistake is not presented to clients as a retryable outage.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let hasPrismaError = false;
  let hasTransientNetworkError = false;

  while (isErrorLike(current) && !seen.has(current)) {
    seen.add(current);

    if (
      typeof current.name === "string" &&
      current.name.startsWith("PrismaClient")
    ) {
      hasPrismaError = true;
    }

    const code =
      typeof current.code === "string"
        ? current.code
        : typeof current.errorCode === "string"
          ? current.errorCode
          : undefined;

    if (code && TRANSIENT_PRISMA_DATABASE_CODES.has(code)) {
      return true;
    }

    if (code && TRANSIENT_NETWORK_CODES.has(code)) {
      hasTransientNetworkError = true;
    }

    const isPrismaInitializationError =
      current.name === "PrismaClientInitializationError";
    const message = typeof current.message === "string" ? current.message : "";

    // Prisma's adapter can omit errorCode on an initialization failure while
    // retaining this stable, connectivity-specific message.
    if (
      isPrismaInitializationError &&
      /(?:can't reach|could not connect to|connection (?:was )?(?:refused|closed|reset)|timed out).*database|database.*(?:unavailable|unreachable)/i.test(
        message,
      )
    ) {
      return true;
    }

    current = current.cause;
  }

  // Raw PG socket errors are only a database signal when Prisma wraps or
  // caused them. An add-on, bridge, or arbitrary HTTP request may also fail
  // with ECONNREFUSED and must retain its own error semantics.
  return hasPrismaError && hasTransientNetworkError;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
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
        code: err.code,
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

  if (isDatabaseUnavailableError(err)) {
    // Do not emit connection strings, database messages, or stack traces to
    // clients. This is an expected recoverable condition in local Docker and
    // during managed database failover, so it also should not page Sentry.
    logger.warn(
      {
        requestId,
        errorName: err.name,
        errorCode:
          typeof (err as ErrorLike).code === "string"
            ? (err as ErrorLike).code
            : (err as ErrorLike).errorCode,
      },
      "Database temporarily unavailable",
    );
    c.header("Retry-After", String(DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS));
    return c.json(
      {
        error: "Database temporarily unavailable. Please try again shortly.",
        code: "DATABASE_UNAVAILABLE",
        requestId,
      },
      503,
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

  captureServerException(err, {
    requestId,
    method: c.req.method,
    url: c.req.url,
  });

  return c.json(
    {
      error: "Internal server error",
      requestId,
    },
    500,
  );
}
