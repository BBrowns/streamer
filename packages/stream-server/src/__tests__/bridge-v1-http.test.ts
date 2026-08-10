import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bridgeCapabilitiesV1Schema,
  bridgeErrorResponseV1Schema,
} from "@streamer/shared";
import { createStreamServerApp } from "../index.js";
import { __resetBridgeV1ForTests } from "../bridge-v1.js";
import { __resetBridgeV1AccessSessionsForTests } from "../security.js";

const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;
const previousBridgeOrigin = process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN;
const previousNodeEnv = process.env.NODE_ENV;

describe("bridge v1 HTTP contract", () => {
  beforeEach(() => {
    process.env.STREAMER_BRIDGE_TOKEN = "bridge-http-test-token";
    process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN = "http://bridge.test:11470/";
    delete process.env.NODE_ENV;
    __resetBridgeV1AccessSessionsForTests();
    __resetBridgeV1ForTests();
  });

  afterEach(() => {
    __resetBridgeV1AccessSessionsForTests();
    __resetBridgeV1ForTests();
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
});
