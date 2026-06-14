import request from "supertest";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gatewayRouter,
  __pruneGatewayJobsForTests,
  __resetGatewayJobsForTests,
} from "../gateway.js";
import { createSignedGatewayStreamPath } from "../security.js";
import {
  ensureTorrentReady,
  prepareSeekableRemux,
  prepareTorrent,
  serveTorrentFile,
  waitForTorrentFileFirstBytes,
} from "../torrent.js";

vi.mock("../torrent.js", () => ({
  ensureTorrentReady: vi.fn(),
  isTorrentEngineUnavailableError: vi.fn(() => false),
  prepareSeekableRemux: vi.fn(),
  prepareTorrent: vi.fn(),
  serveTorrentFile: vi.fn((_req, res) => res.status(204).send()),
  waitForTorrentFileFirstBytes: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/gateway", gatewayRouter);

const previousGatewayStreamSecret = process.env.STREAMER_GATEWAY_STREAM_SECRET;
const previousGatewayStreamTtl = process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;

describe("gateway jobs", () => {
  beforeEach(() => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    delete process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
    __resetGatewayJobsForTests();
    vi.clearAllMocks();
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "movie.mkv", streamURL: "/webtorrent/file" }],
    });
    (ensureTorrentReady as any).mockResolvedValue(undefined);
    (prepareSeekableRemux as any).mockResolvedValue({
      fileName: "movie.mkv",
      size: 1024,
    });
    (waitForTorrentFileFirstBytes as any).mockResolvedValue({
      fileName: "movie.mkv",
      bytesRead: 1,
    });
  });

  afterEach(() => {
    if (previousGatewayStreamSecret === undefined) {
      delete process.env.STREAMER_GATEWAY_STREAM_SECRET;
    } else {
      process.env.STREAMER_GATEWAY_STREAM_SECRET = previousGatewayStreamSecret;
    }

    if (previousGatewayStreamTtl === undefined) {
      delete process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
    } else {
      process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = previousGatewayStreamTtl;
    }
  });

  it("creates a remux job with stable playback and metrics URLs", async () => {
    const res = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:ABCDEF123456",
      remux: "mp4",
      fileIdx: 0,
    });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      state: "preparing",
      phase: "preparing_metadata",
      mode: "remux",
      infoHash: "abcdef123456",
      fileIdx: 0,
      retryable: true,
      peerCount: 1,
      activeStreamCount: 0,
      lastStreamAccessAt: null,
      progress: expect.any(Number),
      readyTimeoutMs: 120000,
      elapsedMs: expect.any(Number),
      playbackUrl: expect.stringMatching(
        /^\/api\/gateway\/jobs\/.+\/stream\?expires=\d+&signature=.+$/,
      ),
      metricsUrl: "/api/torrent/abcdef123456/metrics",
      media: {
        remuxed: true,
        container: "mp4",
        seekable: false,
        cacheStatus: "pending",
      },
    });
  });

  it("reports preparing status with readiness metadata while peers warm up", async () => {
    (ensureTorrentReady as any).mockReturnValueOnce(new Promise(() => {}));

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const status = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );

    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      id: created.body.id,
      state: "preparing",
      phase: "preparing_metadata",
      retryable: true,
      peerCount: 1,
      progress: expect.any(Number),
      readyTimeoutMs: 120000,
      elapsedMs: expect.any(Number),
    });
  });

  it("keeps bridge jobs checking piece availability until first bytes are readable", async () => {
    let resolveFirstBytes: (() => void) | undefined;
    (waitForTorrentFileFirstBytes as any).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstBytes = () =>
          resolve({
            fileName: "movie.mp4",
            bytesRead: 1,
          });
      }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "preparing",
        phase: "checking_piece_availability",
        mode: "bridge",
        retryable: true,
      });
    });

    resolveFirstBytes?.();

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        phase: "ready",
      });
    });
  });

  it("reports stalled when bridge first-byte readiness times out", async () => {
    (waitForTorrentFileFirstBytes as any).mockRejectedValueOnce(
      new Error("Torrent file first byte timeout"),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "stalled",
        phase: "stalled",
        retryable: true,
        error: "Torrent stalled while checking piece availability.",
      });
    });
  });

  it("reports no_peers instead of a generic error when peer discovery times out", async () => {
    (ensureTorrentReady as any).mockRejectedValueOnce(
      new Error("Torrent ready timeout"),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "no_peers",
        phase: "no_peers",
        retryable: true,
        progress: null,
        error: "Torrent metadata timed out. No peers found in 2 minutes.",
      });
    });
  });

  it("reports stalled while metadata warmup has peers but no progress for a long period", async () => {
    vi.useFakeTimers();
    try {
      (ensureTorrentReady as any).mockReturnValueOnce(new Promise(() => {}));

      const created = await request(app)
        .post("/api/gateway/jobs")
        .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

      await vi.advanceTimersByTimeAsync(61_000);
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );

      expect(status.body).toMatchObject({
        state: "stalled",
        phase: "stalled",
        retryable: true,
        peerCount: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a preparing gateway job", async () => {
    (ensureTorrentReady as any).mockReturnValueOnce(new Promise(() => {}));

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const cancelled = await request(app).delete(
      `/api/gateway/jobs/${created.body.id}`,
    );
    const streamed = await request(app).get(created.body.playbackUrl);

    expect(cancelled.status).toBe(202);
    expect(cancelled.body).toMatchObject({
      id: created.body.id,
      state: "cancelled",
      phase: "cancelled",
      progress: null,
      retryable: false,
      playbackUrl: null,
    });
    expect(streamed.status).toBe(410);
    expect(streamed.body).toMatchObject({
      error: "Gateway job cancelled",
      retryable: false,
    });
  });

  it("does not let late warmup completion overwrite cancellation", async () => {
    let resolveReady: (() => void) | undefined;
    (ensureTorrentReady as any).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    await request(app).delete(`/api/gateway/jobs/${created.body.id}`);

    resolveReady?.();
    await new Promise((resolve) => setImmediate(resolve));

    const status = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );
    expect(status.body).toMatchObject({
      state: "cancelled",
      phase: "cancelled",
      retryable: false,
    });
  });

  it("prunes cancelled terminal gateway jobs after their cleanup TTL", async () => {
    (ensureTorrentReady as any).mockReturnValueOnce(new Promise(() => {}));

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    await request(app)
      .delete(`/api/gateway/jobs/${created.body.id}`)
      .expect(202);

    __pruneGatewayJobsForTests(Date.now() + 16 * 60 * 1000);

    await request(app).get(`/api/gateway/jobs/${created.body.id}`).expect(404);
  });

  it("streams a gateway job through the remux path", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", remux: "mp4" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(204);
    expect(serveTorrentFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ infoHash: "abcdef123456" }),
      expect.objectContaining({ remuxFormat: "mp4" }),
    );
  });

  it("rejects remux stream requests until preflight remux is ready", async () => {
    (prepareSeekableRemux as any).mockReturnValueOnce(new Promise(() => {}));

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", remux: "mp4" });
    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(425);
    expect(streamed.body).toMatchObject({
      error: "Gateway remux is still preparing.",
      retryable: true,
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("keeps remux jobs in remuxing phase until the MP4 cache is ready", async () => {
    let resolveRemux: (() => void) | undefined;
    (prepareSeekableRemux as any).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRemux = () =>
          resolve({
            fileName: "movie.mkv",
            size: 1024,
          });
      }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", remux: "mp4" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "preparing",
        phase: "remuxing",
        mode: "remux",
        media: {
          remuxed: true,
          seekable: false,
          cacheStatus: "pending",
        },
      });
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();

    resolveRemux?.();

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        phase: "ready",
        media: {
          remuxed: true,
          seekable: true,
          cacheStatus: "ready",
        },
      });
    });
  });

  it("reports remuxing status and aborts preflight remux work when the job is cancelled", async () => {
    let remuxSignal: AbortSignal | undefined;
    (prepareSeekableRemux as any).mockImplementationOnce(
      (_torrent: unknown, options: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          remuxSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => {
              reject(new Error("Gateway job cancelled"));
            },
            { once: true },
          );
        }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", remux: "mp4" });

    await vi.waitFor(() => expect(prepareSeekableRemux).toHaveBeenCalled());
    const status = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );
    const cancelled = await request(app).delete(
      `/api/gateway/jobs/${created.body.id}`,
    );

    expect(status.body).toMatchObject({
      state: "preparing",
      phase: "remuxing",
      mode: "remux",
      progress: expect.any(Number),
    });
    expect(cancelled.body).toMatchObject({
      state: "cancelled",
      phase: "cancelled",
      retryable: false,
    });
    expect(remuxSignal?.aborted).toBe(true);
  });

  it("rejects unsigned gateway stream URLs", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    const streamed = await request(app).get(
      `/api/gateway/jobs/${created.body.id}/stream`,
    );

    expect(streamed.status).toBe(403);
    expect(streamed.body).toMatchObject({
      error: "Gateway stream URL signature required",
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("rejects tampered gateway stream URLs", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const tamperedUrl = String(created.body.playbackUrl).replace(
      /signature=[^&]+/,
      "signature=tampered",
    );

    const streamed = await request(app).get(tamperedUrl);

    expect(streamed.status).toBe(403);
    expect(streamed.body).toMatchObject({
      error: "Gateway stream URL signature required",
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("rejects expired gateway stream URLs before playback starts", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const expiredUrl = createSignedGatewayStreamPath(
      created.body.id,
      Date.now() - 3 * 60 * 60 * 1000,
    );

    const streamed = await request(app).get(expiredUrl);

    expect(streamed.status).toBe(403);
    expect(streamed.body).toMatchObject({
      error: "Gateway stream URL expired",
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("allows an expired signed URL during active playback grace", async () => {
    process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS = "50";
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await request(app).get(created.body.playbackUrl).expect(204);
    await new Promise((resolve) => setTimeout(resolve, 75));
    await request(app).get(created.body.playbackUrl).expect(204);

    expect(serveTorrentFile).toHaveBeenCalledTimes(2);
  });

  it("forwards file selection hints to torrent streaming", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({
        magnet: "magnet:?xt=urn:btih:abcdef123456",
        fileSelectionHints: {
          season: 1,
          episode: 2,
          title: "Show Name",
        },
      });

    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(204);
    expect(serveTorrentFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ infoHash: "abcdef123456" }),
      expect.objectContaining({
        hints: {
          season: 1,
          episode: 2,
          title: "Show Name",
        },
      }),
    );
  });

  it("prunes a ready job that was never consumed", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    await new Promise((resolve) => setImmediate(resolve));

    __pruneGatewayJobsForTests(Date.now() + 6 * 60 * 1000);

    await request(app).get(`/api/gateway/jobs/${created.body.id}`).expect(404);
  });

  it("keeps an active stream job until the consumer disconnects", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    await new Promise((resolve) => setImmediate(resolve));

    let releaseStream: (() => void) | undefined;
    (serveTorrentFile as any).mockImplementationOnce(
      (_req: unknown, res: express.Response) =>
        new Promise<void>((resolve) => {
          releaseStream = () => {
            res.status(204).send();
            resolve();
          };
        }),
    );

    const streamPromise = request(app).get(created.body.playbackUrl);
    const completedStream = streamPromise.then((response) => response);
    await vi.waitFor(() => expect(serveTorrentFile).toHaveBeenCalled());

    __pruneGatewayJobsForTests(Date.now() + 30 * 60 * 1000);
    const activeStatus = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );

    expect(activeStatus.status).toBe(200);
    expect(activeStatus.body.activeStreamCount).toBe(1);

    releaseStream?.();
    await completedStream;
    __pruneGatewayJobsForTests(Date.now() + 30 * 60 * 1000);

    await request(app).get(`/api/gateway/jobs/${created.body.id}`).expect(404);
  });

  it("returns bridge engine errors before the player starts loading", async () => {
    (prepareTorrent as any).mockRejectedValueOnce(
      new Error("Torrent engine unavailable"),
    );

    const res = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: "Torrent engine unavailable",
      retryable: false,
    });
  });
});
