import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { request } from "./test-utils.js";
import {
  errorHandler,
  AppError,
  isDatabaseUnavailableError,
} from "../src/middleware/error.middleware.js";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import { authMiddleware } from "../src/middleware/auth.middleware.js";
import { sessionRouter } from "../src/modules/sessions/session.routes.js";
import { sessionService } from "../src/modules/sessions/session.service.js";

function accessToken(userId = "user-1") {
  return jwt.sign({ userId, email: "test@example.com" }, env.jwtSecret, {
    expiresIn: "15m",
  });
}

function databaseUnavailableError() {
  return Object.assign(
    new Error("Can't reach database server at `127.0.0.1:5432`"),
    {
      name: "PrismaClientInitializationError",
      errorCode: "P1001",
    },
  );
}

describe("Error Handling & Edge Cases", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);

    app.get("/app-error", () => {
      throw new AppError(403, "Forbidden action");
    });

    app.post("/zod-error", async (c) => {
      const body = await c.req.json();
      z.object({ name: z.string() }).parse(body);
      return c.json({ ok: true });
    });

    app.get("/fatal-error", () => {
      throw new Error("Database connection lost");
    });
  });

  it("should handle AppError correctly", async () => {
    const res = await request(app).get("/app-error");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden action");
  });

  it("should handle ZodError correctly", async () => {
    const res = await request(app).post("/zod-error").send({ age: 25 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toBeDefined();
    expect(res.body.details[0].message).toContain("Invalid input");
  });

  it("should handle unhandled/fatal errors correctly", async () => {
    const stdErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/fatal-error");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    stdErr.mockRestore();
  });

  it("should handle invalid JSON bodies", async () => {
    const res = await request(app)
      .post("/zod-error")
      .set("Content-Type", "application/json")
      .send('{"name": "test", bad json}');

    expect(res.status).toBe(400); // SyntaxError
  });

  it("keeps a downstream database failure out of JWT error handling", async () => {
    const protectedApp = new Hono();
    protectedApp.use("/protected", authMiddleware);
    protectedApp.get("/protected", () => {
      throw databaseUnavailableError();
    });
    protectedApp.onError(errorHandler);

    const res = await request(protectedApp)
      .get("/protected")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("DATABASE_UNAVAILABLE");
    expect(res.headers["retry-after"]).toBe("5");
  });

  it("does not classify an unrelated network failure as a database outage", () => {
    expect(
      isDatabaseUnavailableError(
        Object.assign(new Error("Add-on connection refused"), {
          code: "ECONNREFUSED",
        }),
      ),
    ).toBe(false);
  });

  it("uses the authenticated user context for legacy playback sessions", async () => {
    const sessionsApp = new Hono();
    sessionsApp.route("/sessions", sessionRouter);
    sessionsApp.onError(errorHandler);
    const getSessions = vi
      .spyOn(sessionService, "getSessions")
      .mockResolvedValue([]);

    const res = await request(sessionsApp)
      .get("/sessions")
      .set("Authorization", `Bearer ${accessToken("signed-in-user")}`);

    expect(res.status).toBe(200);
    expect(getSessions).toHaveBeenCalledWith("signed-in-user");
    getSessions.mockRestore();
  });

  it("lets legacy session database failures reach the safe global 503 response", async () => {
    const sessionsApp = new Hono();
    sessionsApp.route("/sessions", sessionRouter);
    sessionsApp.onError(errorHandler);
    const getSessions = vi
      .spyOn(sessionService, "getSessions")
      .mockRejectedValue(databaseUnavailableError());

    const res = await request(sessionsApp)
      .get("/sessions")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("DATABASE_UNAVAILABLE");
    getSessions.mockRestore();
  });
});
