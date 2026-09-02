import {
  bridgeCapabilitiesV1Schema,
  bridgeJobResponseV1Schema,
} from "../schemas/bridge.schema";
import { describe, expect, it } from "vitest";

describe("bridge v1 delivery contract", () => {
  it("accepts an opt-in HLS delivery alongside the legacy deliveries", () => {
    const result = bridgeCapabilitiesV1Schema.safeParse({
      protocolVersion: 1,
      owner: "standalone",
      health: "ready",
      capabilities: {
        jobs: {
          sourceKinds: ["magnet"],
          deliveries: [
            { delivery: "range-http", available: true },
            { delivery: "progressive-fmp4", available: true },
            { delivery: "seekable-cache", available: true },
            { delivery: "hls", available: true },
          ],
          cancellation: true,
          tracks: true,
          subtitles: true,
          thumbnails: true,
          metrics: true,
        },
        cast: {
          available: true,
          controls: ["play", "pause", "resume", "seek", "stop"],
        },
      },
      limits: {
        maxRequestBytes: 16 * 1024,
        maxSubtitleBytes: 8 * 1024 * 1024,
        thumbnailBucketSeconds: 10,
        maxThumbnailBucket: 864,
        maxThumbnailBytes: 512 * 1024,
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a ready HLS job without a seekable-cache sidecar", () => {
    const result = bridgeJobResponseV1Schema.safeParse({
      protocolVersion: 1,
      job: {
        id: "11111111-1111-4111-8111-111111111111",
        state: "ready",
        phase: "ready",
        delivery: "hls",
        peerCount: 1,
        readinessProgress: 1,
        elapsedMs: 100,
        readyTimeoutMs: 32_000,
        media: {
          container: "mp4",
          remuxed: true,
          seek: "immediate",
        },
        stream: {
          path: "/api/bridge/v1/jobs/11111111-1111-4111-8111-111111111111/stream?expires=1800000000000&signature=abc",
          expiresAt: "2027-01-15T08:00:00.000Z",
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
