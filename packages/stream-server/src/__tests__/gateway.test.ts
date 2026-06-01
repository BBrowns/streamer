import request from "supertest";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gatewayRouter, __resetGatewayJobsForTests } from "../gateway.js";
import {
  ensureTorrentReady,
  prepareTorrent,
  serveTorrentFile,
} from "../torrent.js";

vi.mock("../torrent.js", () => ({
  ensureTorrentReady: vi.fn(),
  isTorrentEngineUnavailableError: vi.fn(() => false),
  prepareTorrent: vi.fn(),
  serveTorrentFile: vi.fn((_req, res) => res.status(204).send()),
}));

const app = express();
app.use(express.json());
app.use("/api/gateway", gatewayRouter);

describe("gateway jobs", () => {
  beforeEach(() => {
    __resetGatewayJobsForTests();
    vi.clearAllMocks();
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "movie.mkv", streamURL: "/webtorrent/file" }],
    });
    (ensureTorrentReady as any).mockResolvedValue(undefined);
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
      mode: "remux",
      infoHash: "abcdef123456",
      fileIdx: 0,
      retryable: true,
      peerCount: 1,
      readyTimeoutMs: 120000,
      elapsedMs: expect.any(Number),
      playbackUrl: expect.stringMatching(/^\/api\/gateway\/jobs\/.+\/stream$/),
      metricsUrl: "/api/torrent/abcdef123456/metrics",
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
      retryable: true,
      peerCount: 1,
      readyTimeoutMs: 120000,
      elapsedMs: expect.any(Number),
    });
  });

  it("streams a gateway job through the remux path", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", remux: "mp4" });

    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(204);
    expect(serveTorrentFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ infoHash: "abcdef123456" }),
      expect.objectContaining({ remuxFormat: "mp4" }),
    );
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
