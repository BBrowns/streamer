import {
  bridgeCapabilitiesV1Schema,
  bridgeCreateJobV1Schema,
  bridgeJobResponseV1Schema,
  bridgeNetworkProbeRequestV1Schema,
  bridgeNetworkProbeResponseV1Schema,
} from "../schemas/bridge.schema";
import { describe, expect, it } from "vitest";

describe("bridge v1 delivery contract", () => {
  it.each([undefined, null, "en", "eng", "nl", "es"])(
    "accepts bounded optional audio preference %s with Specials",
    (audioLanguage) => {
      const selection = {
        season: 0,
        episode: 1,
        ...(audioLanguage !== undefined ? { audioLanguage } : {}),
      };
      expect(
        bridgeCreateJobV1Schema.parse({
          requestId: "11111111-1111-4111-8111-111111111111",
          source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
          delivery: "hls",
          selection,
        }).selection,
      ).toEqual(selection);
    },
  );

  it.each(["", "English", "en-US", "EN", "http://invalid", 12, false])(
    "rejects malformed audio preference %s",
    (audioLanguage) => {
      expect(
        bridgeCreateJobV1Schema.safeParse({
          requestId: "11111111-1111-4111-8111-111111111111",
          source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
          delivery: "hls",
          selection: { audioLanguage },
        }).success,
      ).toBe(false);
    },
  );

  it("accepts an opt-in HLS delivery alongside the legacy deliveries", () => {
    const result = bridgeCapabilitiesV1Schema.safeParse({
      protocolVersion: 1,
      owner: "standalone",
      health: "ready",
      capabilities: {
        jobs: {
          sourceKinds: ["magnet"],
          randomHlsSeeking: true,
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

  it("preserves the original v1 wire shape for an old client and old bridge", () => {
    const capabilities = bridgeCapabilitiesV1Schema.parse({
      protocolVersion: 1,
      owner: "standalone",
      health: "ready",
      capabilities: {
        jobs: {
          sourceKinds: ["magnet"],
          deliveries: [
            { delivery: "range-http", available: true },
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
    const request = bridgeCreateJobV1Schema.parse({
      requestId: "11111111-1111-4111-8111-111111111111",
      source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
      delivery: "hls",
    });
    const response = bridgeJobResponseV1Schema.parse({
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

    expect(capabilities.capabilities.jobs).not.toHaveProperty(
      "randomHlsSeeking",
    );
    expect(request).not.toHaveProperty("seekMode");
    expect(response.job.media).not.toHaveProperty("randomSeek");
  });

  it("accepts explicit random-seek intent and a bounded provisional duration", () => {
    expect(
      bridgeCreateJobV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
        delivery: "hls",
        seekMode: "random",
        expectedDurationSeconds: 7_200,
      }).success,
    ).toBe(true);
    expect(
      bridgeCreateJobV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
        delivery: "hls",
        seekMode: "random",
        expectedDurationSeconds: 86_401,
      }).success,
    ).toBe(false);
    expect(
      bridgeCreateJobV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
        delivery: "range-http",
        seekMode: "random",
      }).success,
    ).toBe(false);
    expect(
      bridgeCreateJobV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        source: { kind: "magnet", magnet: "magnet:?xt=urn:btih:abc" },
        delivery: "hls",
        expectedDurationSeconds: 7_200,
      }).success,
    ).toBe(false);
  });

  it("accepts opt-in random-seek capability separately from bridge support", () => {
    const randomSeek = {
      status: "ready" as const,
      durationSeconds: 7_200,
    };
    expect(
      bridgeJobResponseV1Schema.safeParse({
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
            randomSeek,
          },
          stream: {
            path: "/api/bridge/v1/jobs/11111111-1111-4111-8111-111111111111/stream?expires=1800000000000&signature=abc",
            expiresAt: "2027-01-15T08:00:00.000Z",
          },
        },
      }).success,
    ).toBe(true);
  });

  it("preserves provider duration as a separate provisional hint", () => {
    const response = bridgeJobResponseV1Schema.safeParse({
      protocolVersion: 1,
      job: {
        id: "11111111-1111-4111-8111-111111111111",
        state: "preparing",
        phase: "remuxing",
        delivery: "hls",
        peerCount: 1,
        readinessProgress: null,
        elapsedMs: 100,
        readyTimeoutMs: 90_000,
        media: {
          container: "unknown",
          remuxed: true,
          seek: "preparing",
          randomSeek: {
            status: "preparing",
            durationHintSeconds: 7_200,
          },
        },
      },
    });

    expect(response.success).toBe(true);
  });

  it("keeps diagnostics optional for older capability documents", () => {
    const legacy = bridgeCapabilitiesV1Schema.safeParse({
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

    expect(legacy.success).toBe(true);
    expect(
      bridgeCapabilitiesV1Schema.parse(legacy.data).capabilities.diagnostics,
    ).toBeUndefined();
  });

  it("accepts only bounded, source-free network probe contracts", () => {
    expect(
      bridgeNetworkProbeRequestV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        profile: "torrent-playback",
      }).success,
    ).toBe(true);
    expect(
      bridgeNetworkProbeRequestV1Schema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        profile: "torrent-playback",
        magnet: "magnet:?xt=urn:btih:secret",
      }).success,
    ).toBe(false);
    expect(
      bridgeNetworkProbeResponseV1Schema.parse({
        protocolVersion: 1,
        probeId: "22222222-2222-4222-8222-222222222222",
        status: "degraded",
        phase: "metadata",
        elapsedMs: 1_200,
        peerCount: 1,
        failureCode: "METADATA_UNAVAILABLE",
      }),
    ).toMatchObject({ status: "degraded", phase: "metadata" });
  });
});
