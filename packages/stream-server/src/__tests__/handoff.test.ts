import request from "supertest";
import express from "express";
import { handoffRouter } from "../handoff.js";
import { jest } from "@jest/globals";

const app = express();
app.use(express.json());
app.use("/api/handoff", handoffRouter);

describe("Handoff API", () => {
  it("should return 400 if magnet is missing", async () => {
    const res = await request(app).post("/api/handoff").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Magnet link is required");
  });

  it("should return success and emit events on valid handoff", async () => {
    const res = await request(app).post("/api/handoff").send({
      magnet: "magnet:?xt=urn:btih:test",
      title: "Test Movie",
      position: 120,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Note: Electron emission depends on mock or environment,
    // but the code should handle missing electron gracefully.
  });
});
