import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bridgeCapabilitiesV1Schema,
  bridgeCommandResponseV1Schema,
  bridgeErrorResponseV1Schema,
  bridgeOperationalMetricsV1Schema,
} from "@streamer/shared";
import { createStreamServerApp } from "../index.js";
import {
  __resetBridgeV1ForTests,
  __resetBridgeV1RateLimitersForTests,
} from "../bridge-v1.js";
import { __resetBridgeV1AccessSessionsForTests } from "../security.js";

const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;
const previousBridgeOrigin = process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN;
const previousNodeEnv = process.env.NODE_ENV;

describe("bridge v1 HTTP contract", () => {
  beforeEach(async () => {
    process.env.STREAMER_BRIDGE_TOKEN = "bridge-http-test-token";
    process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN = "http://bridge.test:11470/";
    delete process.env.NODE_ENV;
    __resetBridgeV1AccessSessionsForTests();
    __resetBridgeV1ForTests();
    await __resetBridgeV1RateLimitersForTests();
  });

  afterEach(async () => {
    __resetBridgeV1AccessSessionsForTests();
    __resetBridgeV1ForTests();
    await __resetBridgeV1RateLimitersForTests();
    if (previousBridgeToken === undefined)
      delete process.env.STREAMER_BRIDGE_TOKEN;
    else process.env.STREAMER_BRIDGE_TOKEN = previousBridgeToken;
    if (previousBridgeOrigin === undefined)
      delete process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN;
    else process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN = previousBridgeOrigin;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it("serves the unauthenticated hello document", async () => {
    const response = await request(createStreamServerApp()).get(
      "/api/bridge/v1/hello",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      protocol: { name: "streamer-bridge", current: 1, supported: [1] },
      auth: { required: true },
    });
  });

  it("requires scoped auth for capabilities and returns the typed document", async () => {
    const app = createStreamServerApp();
    const missing = await request(app).get("/api/bridge/v1/capabilities");
    expect(missing.status).toBe(401);
    expect(() => bridgeErrorResponseV1Schema.parse(missing.body)).not.toThrow();

    const response = await request(app)
      .get("/api/bridge/v1/capabilities")
      .set("Authorization", "Bearer bridge-http-test-token");

    expect(response.status).toBe(200);
    expect(() => bridgeCapabilitiesV1Schema.parse(response.body)).not.toThrow();
  });

  it("revokes renderer access with loopback master auth", async () => {
    const app = createStreamServerApp();
    const created = await request(app)
      .post("/api/bridge/v1/access-sessions")
      .set("Authorization", "Bearer bridge-http-test-token")
      .send({ scopes: ["capabilities:read"], ttlSeconds: 60 });
    expect(created.status).toBe(200);

    const revoked = await request(app)
      .delete(`/api/bridge/v1/access-sessions/${created.body.sessionId}`)
      .set("Authorization", "Bearer bridge-http-test-token");
    expect(revoked.status).toBe(200);
    expect(bridgeCommandResponseV1Schema.parse(revoked.body)).toEqual({
      protocolVersion: 1,
      success: true,
    });

    const rejected = await request(app)
      .get("/api/bridge/v1/capabilities")
      .set("Authorization", `Bearer ${created.body.accessToken}`);
    expect(rejected.status).toBe(401);

    const repeated = await request(app)
      .delete(`/api/bridge/v1/access-sessions/${created.body.sessionId}`)
      .set("Authorization", "Bearer bridge-http-test-token");
    expect(repeated.status).toBe(200);
  });

  it("exposes master-only privacy-safe bridge counters", async () => {
    const app = createStreamServerApp();
    const response = await request(app)
      .get("/api/bridge/v1/metrics")
      .set("Authorization", "Bearer bridge-http-test-token");

    expect(response.status).toBe(200);
    const metrics = bridgeOperationalMetricsV1Schema.parse(response.body);
    expect(metrics.counters).toMatchObject({
      rate_limited: 0,
      session_renewed: 0,
      idempotency_conflict: 0,
    });
    expect(JSON.stringify(metrics)).not.toContain("bridge-http-test-token");
  });

  it("rejects malformed or scoped access-session revocation", async () => {
    const app = createStreamServerApp();
    const malformed = await request(app)
      .delete("/api/bridge/v1/access-sessions/not-a-uuid")
      .set("Authorization", "Bearer bridge-http-test-token");
    expect(malformed.status).toBe(400);
    expect(bridgeErrorResponseV1Schema.parse(malformed.body).error.code).toBe(
      "INVALID_REQUEST",
    );

    const created = await request(app)
      .post("/api/bridge/v1/access-sessions")
      .set("Authorization", "Bearer bridge-http-test-token")
      .send({ scopes: ["capabilities:read"], ttlSeconds: 60 });
    const forbidden = await request(app)
      .delete(`/api/bridge/v1/access-sessions/${created.body.sessionId}`)
      .set("Authorization", `Bearer ${created.body.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it("returns typed errors for malformed jobs, missing jobs, and cancellation", async () => {
    const app = createStreamServerApp();
    const malformed = await request(app)
      .post("/api/bridge/v1/jobs")
      .set("x-streamer-bridge-token", "bridge-http-test-token")
      .send({ requestId: "not-a-uuid" });

    expect(malformed.status).toBe(400);
    expect(bridgeErrorResponseV1Schema.parse(malformed.body).error.code).toBe(
      "INVALID_REQUEST",
    );

    const missing = await request(app)
      .get("/api/bridge/v1/jobs/missing")
      .set("x-streamer-bridge-token", "bridge-http-test-token");
    expect(missing.status).toBe(404);
    expect(bridgeErrorResponseV1Schema.parse(missing.body).error.code).toBe(
      "JOB_NOT_FOUND",
    );

    const cancelled = await request(app)
      .delete("/api/bridge/v1/jobs/missing")
      .set("x-streamer-bridge-token", "bridge-http-test-token");
    expect(cancelled.status).toBe(204);
  });

  it("rejects JSON bodies above the bridge limit with a typed error", async () => {
    const oversized = JSON.stringify({
      requestId: "00000000-0000-4000-8000-000000000001",
      source: {
        kind: "magnet",
        magnet: `magnet:?xt=urn:btih:${"a".repeat(20)}`,
      },
      delivery: "range-http",
      selection: { title: "x".repeat(20_000) },
    });

    const response = await request(createStreamServerApp())
      .post("/api/bridge/v1/jobs")
      .set("x-streamer-bridge-token", "bridge-http-test-token")
      .set("content-type", "application/json")
      .send(oversized);

    expect(response.status).toBe(413);
    expect(bridgeErrorResponseV1Schema.parse(response.body).error).toEqual({
      code: "INVALID_REQUEST",
      message: "The request exceeds the bridge size limit.",
      retryable: false,
    });
  });

  it("does not derive a cast origin from a caller-controlled Host header", async () => {
    delete process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN;

    const response = await request(createStreamServerApp())
      .post("/api/bridge/v1/cast/play")
      .set("Host", "attacker.example")
      .set("Authorization", "Bearer bridge-http-test-token")
      .send({
        requestId: "00000000-0000-4000-8000-000000000002",
        deviceId: "00000000-0000-4000-8000-000000000003",
        source: {
          kind: "external-url",
          url: "https://cdn.example.test/movie.mp4",
          contentType: "video/mp4",
        },
      });

    expect(response.status).toBe(400);
    expect(bridgeErrorResponseV1Schema.parse(response.body).error.code).toBe(
      "CAST_SOURCE_REJECTED",
    );
  });

  it("rate limits bridge pairing requests with a typed retryable error", async () => {
    const app = createStreamServerApp();
    const body = { scopes: ["jobs:read"], ttlSeconds: 60 };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app)
        .post("/api/bridge/v1/access-sessions")
        .set("Authorization", "Bearer bridge-http-test-token")
        .send(body);
      expect(response.status).toBe(200);
    }

    const blocked = await request(app)
      .post("/api/bridge/v1/access-sessions")
      .set("Authorization", "Bearer bridge-http-test-token")
      .send(body);

    expect(blocked.status).toBe(429);
    expect(bridgeErrorResponseV1Schema.parse(blocked.body).error).toMatchObject(
      {
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterMs: 60_000,
      },
    );
  });
});
