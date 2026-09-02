import { afterEach, describe, expect, it } from "vitest";
import { serializeBridgeJobV1, type GatewayJob } from "../gateway.js";

const previousGatewaySecret = process.env.STREAMER_GATEWAY_STREAM_SECRET;

function makeJob(overrides: Partial<GatewayJob> = {}): GatewayJob {
  return {
    id: "00000000-0000-4000-8000-000000000052",
    magnet: "magnet:?xt=urn:btih:sensitive-hash",
    infoHash: "sensitive-hash",
    fileIdx: 0,
    mode: "bridge",
    remuxStrategy: "seekable-cache",
    requestedDelivery: "range-http",
    state: "preparing",
    peerCount: 3,
    operationAbortControllers: new Set(),
    activeStreamCount: 0,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("bridge v1 gateway serialization", () => {
  afterEach(() => {
    if (previousGatewaySecret === undefined) {
      delete process.env.STREAMER_GATEWAY_STREAM_SECRET;
    } else {
      process.env.STREAMER_GATEWAY_STREAM_SECRET = previousGatewaySecret;
    }
  });

  it("does not mint or expose a stream while a job is preparing", () => {
    const response = serializeBridgeJobV1(makeJob());

    expect(response.job.state).toBe("preparing");
    expect(response.job.stream).toBeUndefined();
    expect(response.job.peerCount).toBe(3);
    expect(JSON.stringify(response)).not.toContain("magnet:");
    expect(JSON.stringify(response)).not.toContain("sensitive-hash");
    expect(JSON.stringify(response)).not.toContain("infoHash");
  });

  it("issues only a relative signed v1 path once the job is ready", () => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-v1-signing-secret";
    const response = serializeBridgeJobV1(
      makeJob({
        state: "ready",
      }),
    );

    expect(response.job.stream?.path).toMatch(
      /^\/api\/bridge\/v1\/jobs\/[0-9a-f-]+\/stream\?expires=\d+&signature=.+$/i,
    );
    expect(response.job.stream?.expiresAt).toMatch(/Z$/);
  });

  it("maps terminal failures to stable redacted codes", () => {
    const response = serializeBridgeJobV1(
      makeJob({
        state: "no_peers",
        error:
          "Failed magnet:?xt=urn:btih:sensitive-hash at /private/cache/file",
        retryable: true,
      }),
    );

    expect(response.job.failure).toEqual({
      code: "NO_PEERS",
      message: "No peers were available for this source.",
      retryable: true,
    });
    expect(JSON.stringify(response)).not.toContain("sensitive-hash");
    expect(JSON.stringify(response)).not.toContain("/private/");
  });

  it("maps asynchronous preparation errors to a fallbackable internal failure", () => {
    const response = serializeBridgeJobV1(
      makeJob({
        mode: "remux",
        remuxStrategy: "progressive-fmp4",
        state: "error",
        error: "FFmpeg input ended prematurely",
        retryable: true,
      }),
    );

    expect(response.job.failure).toEqual({
      code: "INTERNAL",
      message: "The bridge could not prepare this source.",
      retryable: true,
    });
  });

  it("preserves runtime-unavailable as a non-fallbackable bridge failure", () => {
    const response = serializeBridgeJobV1(
      makeJob({
        state: "error",
        failureCode: "RUNTIME_UNAVAILABLE",
        retryable: false,
      }),
    );

    expect(response.job.failure).toEqual({
      code: "RUNTIME_UNAVAILABLE",
      message: "The torrent runtime is unavailable.",
      retryable: false,
    });
  });
});
