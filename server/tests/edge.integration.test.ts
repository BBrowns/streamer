import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { request } from "./test-utils.js";
import { errorHandler, AppError } from "../src/middleware/error.middleware.js";
import { z } from "zod";

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
    expect(res.body.details[0].message).toContain("Required");
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
});
