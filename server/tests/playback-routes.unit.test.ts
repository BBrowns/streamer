import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playbackPlanV3Schema,
  plannerTelemetryMetricsV1Schema,
  type DeviceProfile,
  type PlaybackExecutionNode,
  type PlaybackPlanV3Request,
  type PlaybackRouteCapabilities,
  type Stream,
} from "@streamer/shared";
import { request } from "./test-utils.js";

vi.mock("../src/middleware/auth.middleware.js", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { userId: "route-user", email: "route@example.test" });
    c.set("requestId", c.req.header("X-Request-Id") || "route-request");
    return next();
  },
}));

vi.mock("../src/modules/aggregator/aggregator.service.js", () => ({
  aggregatorService: {
    getStreams: vi.fn(),
    getStreamDiscovery: vi.fn(),
  },
}));

import { playbackRouter } from "../src/modules/playback/playback.routes.js";
import { playbackPlannerService } from "../src/modules/playback/playback-planner.service.js";
import { playbackPlannerV3Service } from "../src/modules/playback/playback-planner-v3.service.js";
import { aggregatorService } from "../src/modules/aggregator/aggregator.service.js";
import {
  __resetPlannerTelemetryForTests,
  getPlannerTelemetryMetricsSnapshot,
} from "../src/modules/playback/planner-telemetry.service.js";

const capabilities: PlaybackRouteCapabilities = {
  seek: "immediate",
  audioTracks: true,
  embeddedSubtitles: true,
  externalSubtitles: true,
  cast: true,
  offline: true,
  thumbnails: true,
};

const deviceProfile: DeviceProfile = {
  platform: "web",
  maxQuality: "1080p",
  network: "local",
  supports: {
    h264: true,
    h265: false,
    av1: false,
    mp4: true,
    mkv: false,
    hls: true,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

function executionNode(): PlaybackExecutionNode {
  return {
    executionTarget: "on-device",
    availability: "available",
    acceptedSourceKinds: ["direct"],
    deliveries: [{ delivery: "direct", capabilities }],
  };
}

function planRequest(): PlaybackPlanV3Request {
  return {
    version: 3,
    type: "movie",
    id: "tt-route",
    action: "play",
    deviceProfile,
    executionNodes: [executionNode()],
  };
}

describe("playback planning routes", () => {
  const app = new Hono();
  app.route("/api/playback", playbackRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    __resetPlannerTelemetryForTests();
    vi.mocked(aggregatorService.getStreamDiscovery).mockImplementation(
      async (userId, type, id, requestId, options) => ({
        streams: await aggregatorService.getStreams(
          userId,
          type,
          id,
          requestId,
          options,
        ),
        status: "complete",
      }),
    );
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.mp4",
        title: "Movie.mp4",
        resolution: "1080p",
      } as Stream,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards a valid v3 request to the planner with user, request id, and abort signal", async () => {
    const service = playbackPlannerV3Service;
    const expected = await service.createPlanV3(
      "route-user",
      planRequest(),
      "route-request",
    );
    const createPlan = vi
      .spyOn(service, "createPlanV3")
      .mockResolvedValue(expected);

    const response = await request(app)
      .post("/api/playback/plan/v3")
      .set("X-Request-Id", "route-request")
      .send(planRequest());

    expect(response.status).toBe(200);
    expect(() => playbackPlanV3Schema.parse(response.body)).not.toThrow();
    expect(createPlan).toHaveBeenCalledWith(
      "route-user",
      planRequest(),
      "route-request",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects malformed v3 input before invoking the planner", async () => {
    const createPlan = vi.spyOn(playbackPlannerV3Service, "createPlanV3");
    const response = await request(app)
      .post("/api/playback/plan/v3")
      .send({ version: 2, type: "movie" });

    expect(response.status).toBe(400);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("keeps the legacy v2 route wired to its existing planner", async () => {
    const expected = await playbackPlannerService.createPlan(
      "route-user",
      {
        type: "movie",
        id: "tt-route",
        action: "play",
        deviceProfile,
      },
      "route-request",
    );
    const createPlan = vi
      .spyOn(playbackPlannerService, "createPlan")
      .mockResolvedValue(expected as any);

    const response = await request(app).post("/api/playback/plan").send({
      type: "movie",
      id: "tt-route",
      action: "play",
      deviceProfile,
    });

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(2);
    expect(response.body.deprecation).toEqual({
      status: "deprecated",
      replacementVersion: 3,
    });
    expect(
      getPlannerTelemetryMetricsSnapshot().counters.v2_legacy_selection,
    ).toBe(1);
    expect(createPlan).toHaveBeenCalledWith(
      "route-user",
      expect.objectContaining({ type: "movie", action: "play" }),
      "route-request",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("records v3 success and exposes only aggregate planner metrics", async () => {
    const response = await request(app)
      .post("/api/playback/plan/v3")
      .send(planRequest());

    expect(response.status).toBe(200);
    const metricsResponse = await request(app).get("/api/playback/metrics");

    expect(metricsResponse.status).toBe(200);
    expect(() =>
      plannerTelemetryMetricsV1Schema.parse(metricsResponse.body),
    ).not.toThrow();
    expect(metricsResponse.body.counters).toEqual(
      expect.objectContaining({ v3_success: 1 }),
    );
    expect(JSON.stringify(metricsResponse.body)).not.toMatch(
      /tt-route|route-user|route-request|https?:\/\//,
    );
  });

  it("records a bounded v3 unsupported fallback signal on the v2 route", async () => {
    const expected = await playbackPlannerService.createPlan(
      "route-user",
      {
        type: "movie",
        id: "tt-route",
        action: "play",
        deviceProfile,
      },
      "route-request",
    );
    vi.spyOn(playbackPlannerService, "createPlan").mockResolvedValue(
      expected as any,
    );

    const response = await request(app)
      .post("/api/playback/plan")
      .set("X-Playback-Planner-Compatibility", "v3-unsupported-fallback")
      .send({
        type: "movie",
        id: "tt-route",
        action: "play",
        deviceProfile,
      });

    expect(response.status).toBe(200);
    expect(getPlannerTelemetryMetricsSnapshot().counters).toEqual(
      expect.objectContaining({
        v2_legacy_selection: 1,
        v3_unsupported_fallback: 1,
      }),
    );
  });
});
