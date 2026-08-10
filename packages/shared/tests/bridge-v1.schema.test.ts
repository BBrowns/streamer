import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  bridgeAccessSessionV1Schema,
  bridgeCapabilitiesV1Schema,
  bridgeCastControlV1Schema,
  bridgeCreateJobV1Schema,
  bridgeErrorResponseV1Schema,
  bridgeHelloV1Schema,
  bridgeJobResponseV1Schema,
  bridgeTrackCatalogV1Schema,
  type BridgeHelloV1,
  type BridgeJobResponseV1,
} from "../src";

const JOB_ID = "00000000-0000-4000-8000-000000000041";
const MEDIA_ID = "00000000-0000-4000-8000-000000000042";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000043";
const REQUEST_ID = "00000000-0000-4000-8000-000000000044";

function makeJobResponse(): BridgeJobResponseV1 {
  return {
    protocolVersion: 1,
    job: {
      id: JOB_ID,
      state: "ready",
      phase: "ready",
      delivery: "range-http",
      peerCount: 8,
      readinessProgress: 1,
      elapsedMs: 2_000,
      readyTimeoutMs: 60_000,
      media: {
        container: "mkv",
        remuxed: false,
        seek: "immediate",
      },
      stream: {
        path: `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=123&signature=signed`,
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    },
  };
}

describe("bridge v1 negotiation and capabilities", () => {
  it("keeps the public hello response minimal and deterministic", () => {
    const hello: BridgeHelloV1 = {
      protocol: {
        name: "streamer-bridge",
        current: 1,
        supported: [1],
      },
      serviceVersion: "0.1.0",
      auth: {
        required: true,
        methods: ["bearer", "x-streamer-bridge-token"],
      },
    };

    expect(bridgeHelloV1Schema.parse(hello)).toEqual(hello);
    expect(
      bridgeHelloV1Schema.safeParse({ ...hello, pid: 12_345 }).success,
    ).toBe(false);
  });

  it("exposes bounded capabilities without runtime or filesystem details", () => {
    const capabilities = {
      protocolVersion: 1 as const,
      owner: "desktop" as const,
      health: "ready" as const,
      capabilities: {
        jobs: {
          sourceKinds: ["magnet"] as ["magnet"],
          deliveries: [
            { delivery: "range-http" as const, available: true },
            {
              delivery: "progressive-fmp4" as const,
              available: false,
              unavailableReason: "ffmpeg_unavailable" as const,
            },
          ],
          cancellation: true as const,
          tracks: true as const,
          subtitles: true as const,
          thumbnails: true as const,
          metrics: true as const,
        },
        cast: {
          available: true,
          controls: ["play", "pause", "resume", "seek", "stop"] as [
            "play",
            "pause",
            "resume",
            "seek",
            "stop",
          ],
        },
      },
      limits: {
        maxRequestBytes: 16_384,
        maxSubtitleBytes: 5_000_000,
        thumbnailBucketSeconds: 10,
        maxThumbnailBucket: 8_640,
        maxThumbnailBytes: 2_000_000,
      },
    };

    expect(bridgeCapabilitiesV1Schema.parse(capabilities)).toEqual(
      capabilities,
    );
    expect(
      bridgeCapabilitiesV1Schema.safeParse({
        ...capabilities,
        ffmpegPath: "/private/runtime/ffmpeg",
      }).success,
    ).toBe(false);
  });
});

describe("bridge v1 jobs", () => {
  it("accepts a bounded, idempotent magnet request", () => {
    const request = {
      requestId: REQUEST_ID,
      source: {
        kind: "magnet" as const,
        magnet: "magnet:?xt=urn:btih:abcdef",
      },
      delivery: "range-http" as const,
      selection: {
        fileIndex: 0,
        title: "Episode 1",
        season: 1,
        episode: 1,
      },
    };

    expect(bridgeCreateJobV1Schema.parse(request)).toEqual(request);
    expect(
      bridgeCreateJobV1Schema.safeParse({
        ...request,
        source: { ...request.source, magnet: `magnet:?${"x".repeat(8_193)}` },
      }).success,
    ).toBe(false);
  });

  it("only issues a relative signed stream path for ready jobs", () => {
    expect(bridgeJobResponseV1Schema.parse(makeJobResponse())).toEqual(
      makeJobResponse(),
    );

    const preparing = makeJobResponse();
    preparing.job.state = "preparing";
    preparing.job.phase = "finding_peers";

    expect(bridgeJobResponseV1Schema.safeParse(preparing).success).toBe(false);

    const externalStream = makeJobResponse();
    externalStream.job.stream!.path =
      "http://127.0.0.1:11470/api/bridge/v1/jobs/job/stream?token=secret";

    expect(bridgeJobResponseV1Schema.safeParse(externalStream).success).toBe(
      false,
    );
  });

  it("uses stable, redacted error codes", () => {
    const response = {
      protocolVersion: 1 as const,
      error: {
        code: "JOB_NOT_READY" as const,
        message: "The bridge job is not ready.",
        retryable: true,
        retryAfterMs: 1_000,
      },
    };

    expect(bridgeErrorResponseV1Schema.parse(response)).toEqual(response);
    expect(
      bridgeErrorResponseV1Schema.safeParse({
        ...response,
        error: {
          ...response.error,
          details: { infoHash: "abcdef", magnet: "magnet:?secret" },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps track identities opaque and job-scoped", () => {
    const catalog = {
      protocolVersion: 1 as const,
      jobId: JOB_ID,
      mediaId: MEDIA_ID,
      tracks: [],
      subtitles: [
        {
          id: "subtitle-1",
          language: "en",
          format: "vtt" as const,
          source: "embedded" as const,
          label: "English",
          hearingImpaired: false,
          forced: false,
          fileHashMatch: false,
          fileNameMatch: false,
          contentIdMatch: true,
          confidence: 1,
          active: true,
          documentId: DOCUMENT_ID,
        },
      ],
    };

    expect(bridgeTrackCatalogV1Schema.parse(catalog)).toEqual(catalog);
    expect(
      bridgeTrackCatalogV1Schema.safeParse({
        ...catalog,
        subtitles: [
          {
            ...catalog.subtitles[0],
            fetchIdentity: "embedded:3",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps response DTOs free of forbidden source and host identities", () => {
    const parsed = bridgeJobResponseV1Schema.parse(makeJobResponse());
    const forbidden = new Set([
      "magnet",
      "infoHash",
      "metricsUrl",
      "playbackUrl",
      "downloadUrl",
      "filePath",
      "tempPath",
      "pairingToken",
      "host",
      "port",
    ]);

    function inspect(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(inspect);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(forbidden.has(key)).toBe(false);
        inspect(child);
      }
    }

    inspect(parsed);
  });

  it("keeps job response schema inference aligned with the exported type", () => {
    expectTypeOf<
      z.infer<typeof bridgeJobResponseV1Schema>
    >().toEqualTypeOf<BridgeJobResponseV1>();
  });
});

describe("bridge v1 scoped access and cast controls", () => {
  it("normalizes a short-lived scoped access session", () => {
    expect(
      bridgeAccessSessionV1Schema.parse({
        protocolVersion: 1,
        sessionId: "00000000-0000-4000-8000-000000000045",
        accessToken: "x".repeat(48),
        expiresAt: "2030-01-01T00:05:00.000Z",
      }),
    ).toMatchObject({ protocolVersion: 1 });
  });

  it("requires a bounded position only for seek controls", () => {
    expect(
      bridgeCastControlV1Schema.safeParse({
        deviceId: "00000000-0000-4000-8000-000000000046",
        action: "seek",
      }).success,
    ).toBe(false);

    expect(
      bridgeCastControlV1Schema.safeParse({
        deviceId: "00000000-0000-4000-8000-000000000046",
        action: "pause",
        positionSeconds: 42,
      }).success,
    ).toBe(false);
  });
});
