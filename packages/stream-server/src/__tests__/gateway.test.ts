import request from "supertest";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gatewayRouter,
  __pruneGatewayJobsForTests,
  __resetGatewayJobsForTests,
  getGatewayJob,
  serializeBridgeJobV1,
  selectPreferredAudioTrack,
  serveGatewayJobSegment,
} from "../gateway.js";
import { createSignedGatewayStreamPath } from "../security.js";
import {
  ensureTorrentReady,
  evaluateSeekableRemuxPreparation,
  getClient,
  getRetainedSeekableRemuxSource,
  getSelectedFile,
  createHlsRemuxSession,
  prepareSeekableRemux,
  retainSeekableRemux,
  prepareTorrent,
  serveTorrentFile,
  shouldRemuxTorrentFile,
  waitForTorrentFileFirstBytes,
} from "../torrent.js";
import { seekThumbnailService } from "../seek-thumbnail.js";
import {
  discoverExternalSubtitleCandidates,
  probeMediaTracksAtUrl,
} from "../media-probe.js";
import {
  extractEmbeddedSubtitleToVtt,
  normalizeSubtitleBuffer,
  readTorrentSubtitleBuffer,
} from "../subtitle-normalizer.js";

vi.mock("../torrent.js", () => ({
  ensureTorrentReady: vi.fn(),
  evaluateSeekableRemuxPreparation: vi.fn(),
  getClient: vi.fn(),
  getRetainedSeekableRemuxSource: vi.fn(),
  getSelectedFile: vi.fn(
    (torrent: { files: unknown[] }, fileIdx?: number) =>
      torrent.files[typeof fileIdx === "number" ? fileIdx : 0],
  ),
  createHlsRemuxSession: vi.fn(),
  isTorrentEngineUnavailableError: vi.fn(() => false),
  prepareSeekableRemux: vi.fn(),
  retainSeekableRemux: vi.fn(() => () => {}),
  prepareTorrent: vi.fn(),
  serveTorrentFile: vi.fn((_req, res) => res.status(204).send()),
  shouldRemuxTorrentFile: vi.fn(
    (filename: string, requestedRemuxFormat?: string) =>
      requestedRemuxFormat === "mp4" || filename.toLowerCase().endsWith(".mkv"),
  ),
  waitForTorrentFileFirstBytes: vi.fn(),
  destroyTorrentByInfoHash: vi.fn(),
}));

vi.mock("../seek-thumbnail.js", () => ({
  seekThumbnailService: {
    getOrCreate: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("../media-probe.js", () => ({
  createMediaProbeCache: vi.fn(() => ({
    getOrCreate: vi.fn((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
    clear: vi.fn(),
  })),
  discoverExternalSubtitleCandidates: vi.fn(() => []),
  probeMediaTracksAtUrl: vi.fn(),
}));

vi.mock("../subtitle-normalizer.js", () => ({
  extractEmbeddedSubtitleToVtt: vi.fn(),
  normalizeSubtitleBuffer: vi.fn(),
  readTorrentSubtitleBuffer: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/gateway", gatewayRouter);
app.get("/api/bridge/v1/jobs/:id/segments/:segment", serveGatewayJobSegment);

const previousGatewayStreamSecret = process.env.STREAMER_GATEWAY_STREAM_SECRET;
const previousGatewayStreamTtl = process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;

describe("gateway jobs", () => {
  beforeEach(() => {
    process.env.STREAMER_GATEWAY_STREAM_SECRET = "test-gateway-secret";
    delete process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS;
    __resetGatewayJobsForTests();
    vi.clearAllMocks();
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "movie.mp4", streamURL: "/webtorrent/file" }],
    });
    (ensureTorrentReady as any).mockResolvedValue(undefined);
    (getClient as any).mockResolvedValue({
      server: { address: () => ({ port: 11470 }) },
    });
    (evaluateSeekableRemuxPreparation as any).mockResolvedValue({
      eligible: true,
      sourceBytes: 1024,
    });
    (prepareSeekableRemux as any).mockResolvedValue({
      fileName: "movie.mkv",
      size: 1024,
    });
    (getRetainedSeekableRemuxSource as any).mockReturnValue(undefined);
    (seekThumbnailService.getOrCreate as any).mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
    (waitForTorrentFileFirstBytes as any).mockResolvedValue({
      fileName: "movie.mkv",
      bytesRead: 1,
    });
    (discoverExternalSubtitleCandidates as any).mockReturnValue([]);
    (probeMediaTracksAtUrl as any).mockResolvedValue([
      {
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "en",
        title: "English",
        codec: "aac",
        channelCount: 2,
        channelLayout: "stereo",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
    ]);
    (normalizeSubtitleBuffer as any).mockReturnValue(
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n",
    );
    (readTorrentSubtitleBuffer as any).mockResolvedValue(
      Buffer.from("subtitle"),
    );
    (extractEmbeddedSubtitleToVtt as any).mockResolvedValue(
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n",
    );
  });

  it("does not silently select a non-English track when English is required", () => {
    expect(
      selectPreferredAudioTrack([
        {
          id: "audio:1",
          kind: "audio",
          language: "es",
          default: true,
          audioDescription: false,
          commentary: false,
          supported: true,
        },
      ]),
    ).toBeUndefined();
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

    if (previousBridgeToken === undefined) {
      delete process.env.STREAMER_BRIDGE_TOKEN;
    } else {
      process.env.STREAMER_BRIDGE_TOKEN = previousBridgeToken;
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
      mode: "remux",
      infoHash: "abcdef123456",
      fileIdx: 0,
      retryable: true,
      peerCount: 1,
      activeStreamCount: 0,
      lastStreamAccessAt: null,
      progress: null,
      readyTimeoutMs: 92000,
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
      progress: null,
      readyTimeoutMs: 52000,
      elapsedMs: expect.any(Number),
    });
    const readinessCall = (ensureTorrentReady as any).mock.calls[0];
    expect(readinessCall?.[1]).toBe(32_000);
    expect(readinessCall?.[2]).toEqual(
      expect.objectContaining({ onMetadata: expect.any(Function) }),
    );
  });

  it("serves only fixed, authenticated thumbnail buckets from the retained seekable cache", async () => {
    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remux: "mp4",
      fileIdx: 0,
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });
    (getRetainedSeekableRemuxSource as any).mockReturnValue({
      cacheKey: "opaque-cache-key",
      filePath: "/private/runtime/retained-cache.mp4",
      size: 1024,
    });

    process.env.STREAMER_BRIDGE_TOKEN = "paired-client";
    await request(app)
      .get(`/api/gateway/jobs/${created.body.id}/thumbnails/2`)
      .expect(401);

    const thumbnail = await request(app)
      .get(`/api/gateway/jobs/${created.body.id}/thumbnails/2`)
      .set("Authorization", "Bearer paired-client");

    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(thumbnail.headers["cache-control"]).toBe("no-store");
    expect(thumbnail.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(seekThumbnailService.getOrCreate).toHaveBeenCalledWith({
      cacheKey: "opaque-cache-key",
      filePath: "/private/runtime/retained-cache.mp4",
      timeSeconds: 20,
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects malformed or unbounded thumbnail buckets before starting FFmpeg", async () => {
    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remux: "mp4",
      fileIdx: 0,
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app)
      .get(`/api/gateway/jobs/${created.body.id}/thumbnails/not-a-bucket`)
      .expect(400);
    await request(app)
      .get(`/api/gateway/jobs/${created.body.id}/thumbnails/8641`)
      .expect(400);
    expect(seekThumbnailService.getOrCreate).not.toHaveBeenCalled();
  });

  it("keeps thumbnails unavailable until the exact gateway job owns a seekable cache", async () => {
    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      fileIdx: 0,
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const response = await request(app).get(
      `/api/gateway/jobs/${created.body.id}/thumbnails/1`,
    );

    expect(response.status).toBe(425);
    expect(response.body).toMatchObject({ retryable: true });
    expect(getRetainedSeekableRemuxSource).not.toHaveBeenCalled();
    expect(seekThumbnailService.getOrCreate).not.toHaveBeenCalled();
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

  it("promotes a bridge job to progressive fMP4 when the selected file needs remux", async () => {
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        phase: "ready",
        mode: "remux",
        media: expect.objectContaining({
          remuxed: true,
          container: "mp4",
        }),
      });
    });
    expect(serializeBridgeJobV1(getGatewayJob(created.body.id)!)).toMatchObject(
      {
        job: { delivery: "progressive-fmp4" },
      },
    );
    expect(prepareSeekableRemux).not.toHaveBeenCalled();
    expect(waitForTorrentFileFirstBytes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
    expect(getSelectedFile).toHaveBeenCalled();
    expect(shouldRemuxTorrentFile).toHaveBeenCalledWith("actual-video.mkv");
  });

  it("binds later track and subtitle work to the exact inferred video file", async () => {
    const files = [
      { name: "sample.mp4", streamURL: "/webtorrent/sample" },
      { name: "S01E02.mkv", streamURL: "/webtorrent/episode" },
    ];
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files,
    });
    (getSelectedFile as any).mockReturnValueOnce(files[1]);

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        fileIdx: 1,
      });
    });
  });

  it("returns URL-free tracks for the gateway-selected file", async () => {
    const file = {
      name: "movie.mkv",
      streamURL: "/webtorrent/movie",
    };
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [file],
    });
    (probeMediaTracksAtUrl as any).mockResolvedValue([
      {
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "en",
        title: "English",
        codec: "eac3",
        channelCount: 6,
        channelLayout: "5.1",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
    ]);

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      fileIdx: 0,
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const catalog = await request(app).get(
      `/api/gateway/jobs/${created.body.id}/tracks`,
    );

    expect(catalog.status).toBe(200);
    expect(catalog.body).toMatchObject({
      jobId: created.body.id,
      selectedFileIndex: 0,
      tracks: [
        expect.objectContaining({
          id: "audio:1",
          language: "en",
          channelCount: 6,
        }),
      ],
    });
    expect(JSON.stringify(catalog.body)).not.toMatch(
      /magnet:|playbackUrl|streamURL|btih/i,
    );
  });

  it("serves only catalog-approved external subtitles as normalized WebVTT", async () => {
    const files = [
      {
        name: "Movie.2026.mkv",
        streamURL: "/webtorrent/movie",
      },
      {
        name: "Movie.2026.nl.srt",
        length: 128,
        createReadStream: vi.fn(),
      },
    ];
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files,
    });
    (discoverExternalSubtitleCandidates as any).mockReturnValue([
      {
        id: "torrent-file:1",
        language: "nl",
        format: "srt",
        source: "torrent-file",
        label: "Movie.2026.nl.srt",
        hearingImpaired: false,
        forced: false,
        fileHashMatch: false,
        fileNameMatch: true,
        contentIdMatch: false,
        confidence: 0.85,
        active: false,
        fetchIdentity: "external:1",
      },
    ]);

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", fileIdx: 0 });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const subtitle = await request(app).get(
      `/api/gateway/jobs/${created.body.id}/subtitles/${encodeURIComponent(
        "external:1",
      )}`,
    );

    expect(subtitle.status).toBe(200);
    expect(subtitle.headers["content-type"]).toMatch(
      /^text\/vtt; charset=utf-8/,
    );
    expect(subtitle.headers["cache-control"]).toBe("no-store");
    expect(subtitle.text).toContain("WEBVTT");
    expect(readTorrentSubtitleBuffer).toHaveBeenCalledWith(
      files[1],
      expect.any(AbortSignal),
    );
    expect(normalizeSubtitleBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      "srt",
    );

    vi.mocked(readTorrentSubtitleBuffer).mockClear();
    await request(app)
      .get(
        `/api/gateway/jobs/${created.body.id}/subtitles/${encodeURIComponent(
          "external:0",
        )}`,
      )
      .expect(404);
    expect(readTorrentSubtitleBuffer).not.toHaveBeenCalled();
  });

  it("extracts an approved embedded text subtitle from the selected media", async () => {
    const selectedFile = {
      name: "Movie.2026.mkv",
      streamURL: "/webtorrent/movie",
    };
    (prepareTorrent as any).mockResolvedValue({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [selectedFile],
    });
    (probeMediaTracksAtUrl as any).mockResolvedValue([
      {
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "en",
        title: "English",
        codec: "aac",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
      {
        id: "subtitle:3",
        streamIndex: 3,
        kind: "subtitle",
        language: "en",
        title: "English",
        codec: "subrip",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
    ]);

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", fileIdx: 0 });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app)
      .get(
        `/api/gateway/jobs/${created.body.id}/subtitles/${encodeURIComponent(
          "embedded:3",
        )}`,
      )
      .expect(200);

    expect(extractEmbeddedSubtitleToVtt).toHaveBeenCalledWith({
      streamUrl: "http://127.0.0.1:11470/webtorrent/movie",
      streamIndex: 3,
      signal: expect.any(AbortSignal),
    });
  });

  it("aborts subtitle extraction when its owning gateway job is cancelled", async () => {
    let extractionSignal: AbortSignal | undefined;
    (probeMediaTracksAtUrl as any).mockResolvedValue([
      {
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "en",
        title: "English",
        codec: "aac",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
      {
        id: "subtitle:3",
        streamIndex: 3,
        kind: "subtitle",
        language: "en",
        codec: "subrip",
        default: false,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded",
        supported: true,
      },
    ]);
    (extractEmbeddedSubtitleToVtt as any).mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          extractionSignal = signal;
          signal.addEventListener(
            "abort",
            () => reject(new Error("Gateway job cancelled")),
            { once: true },
          );
        }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456", fileIdx: 0 });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const pendingSubtitle = request(app)
      .get(
        `/api/gateway/jobs/${created.body.id}/subtitles/${encodeURIComponent(
          "embedded:3",
        )}`,
      )
      .then((response) => response);
    await vi.waitFor(() => expect(extractionSignal).toBeDefined());

    await request(app)
      .delete(`/api/gateway/jobs/${created.body.id}`)
      .expect(202);

    expect(extractionSignal?.aborted).toBe(true);
    expect((await pendingSubtitle).status).toBe(410);
  });

  it("uses first-byte preflight and progressive fMP4 delivery for an opted-in Play remux", async () => {
    let resolveFirstBytes: (() => void) | undefined;
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (waitForTorrentFileFirstBytes as any).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstBytes = () =>
          resolve({ fileName: "actual-video.mkv", bytesRead: 1 });
      }),
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "preparing",
        phase: "remuxing",
        mode: "remux",
        readyTimeoutMs: 52_000,
        media: {
          remuxed: true,
          seekable: false,
          cacheStatus: "streaming",
        },
      });
    });
    expect(prepareSeekableRemux).not.toHaveBeenCalled();

    resolveFirstBytes?.();

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        phase: "ready",
        readyTimeoutMs: 52_000,
        media: {
          remuxed: true,
          seekable: false,
          cacheStatus: "streaming",
        },
      });
    });

    const streamed = await request(app).get(created.body.playbackUrl);
    expect(streamed.status).toBe(204);
    expect(serveTorrentFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        remuxFormat: "mp4",
        remuxStrategy: "progressive-fmp4",
      }),
    );
  });

  it("publishes an HLS manifest and first fragment before full remux completion", async () => {
    const hlsSession = {
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      readManifest: vi
        .fn()
        .mockResolvedValue(
          [
            "#EXTM3U",
            '#EXT-X-MAP:URI="init.mp4"',
            "#EXTINF:2.000,",
            "segment-000000.m4s",
            "",
          ].join("\n"),
        ),
      readSegment: vi.fn().mockResolvedValue(Buffer.from("fragment")),
      getPublishedWindow: vi
        .fn()
        .mockReturnValue({ durationSeconds: 2, segmentCount: 1 }),
      close: vi.fn(),
    };
    (createHlsRemuxSession as any).mockResolvedValueOnce(hlsSession);
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remux: "mp4",
      remuxStrategy: "hls",
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        mode: "remux",
        media: { remuxed: true, seekable: true },
      });
    });

    expect(serializeBridgeJobV1(getGatewayJob(created.body.id)!)).toMatchObject(
      { job: { delivery: "hls" } },
    );
    expect(createHlsRemuxSession).toHaveBeenCalledWith(
      expect.objectContaining({ name: "actual-video.mkv" }),
      expect.objectContaining({ firstFragmentTimeoutMs: 20_000 }),
    );
    expect(prepareSeekableRemux).not.toHaveBeenCalled();

    const manifest = await request(app).get(created.body.playbackUrl);
    expect(manifest.status).toBe(200);
    expect(manifest.headers["content-type"]).toMatch(
      /^application\/vnd.apple.mpegurl/,
    );
    expect(manifest.text).toContain(
      `/api/bridge/v1/jobs/${created.body.id}/segments/init.mp4`,
    );
    expect(manifest.text).toContain(
      `/api/bridge/v1/jobs/${created.body.id}/segments/segment-000000.m4s`,
    );

    const segmentPath = manifest.text
      .split(/\r?\n/)
      .find((line) => line.includes("segment-000000.m4s"));
    expect(segmentPath).toBeDefined();
    const segment = await request(app).get(segmentPath!);
    expect(segment.status).toBe(200);
    expect(segment.body).toEqual(Buffer.from("fragment"));
    expect(hlsSession.readSegment).toHaveBeenCalledWith("segment-000000.m4s");
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("selects an English main audio track before starting a progressive remux", async () => {
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (probeMediaTracksAtUrl as any).mockResolvedValueOnce([
      {
        id: "audio:1",
        streamIndex: 1,
        kind: "audio",
        language: "es",
        default: true,
        audioDescription: false,
        commentary: false,
        supported: true,
      },
      {
        id: "audio:2",
        streamIndex: 2,
        kind: "audio",
        language: "en",
        default: false,
        audioDescription: false,
        commentary: false,
        supported: true,
      },
    ]);

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);

    expect(serveTorrentFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ audioTrackId: "audio:2" }),
    );
  });

  it("marks the gateway job failed when progressive remuxing dies after response start", async () => {
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (serveTorrentFile as any).mockImplementationOnce(
      (_req: unknown, res: any, _torrent: unknown, options: any) => {
        options.onError?.(new Error("FFmpeg progressive remux failed"));
        return res.status(204).send();
      },
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);

    const status = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );
    expect(status.body).toMatchObject({
      state: "error",
      retryable: true,
      error: "A compatible stream could not be prepared.",
    });
  });

  it("starts one seekable cache only after a progressive job gets its first consumer and hands off through the same URL", async () => {
    let resolveCache: (() => void) | undefined;
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (prepareSeekableRemux as any).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCache = () =>
          resolve({ fileName: "actual-video.mkv", size: 1024 });
      }),
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });
    expect(prepareSeekableRemux).not.toHaveBeenCalled();

    await request(app).get(created.body.playbackUrl).expect(204);

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.media).toMatchObject({
        remuxed: true,
        seekable: false,
        cacheStatus: "streaming",
        seekableCache: {
          status: "preparing",
          startedAt: expect.any(String),
          completedAt: null,
        },
      });
    });
    expect(prepareSeekableRemux).toHaveBeenCalledTimes(1);

    resolveCache?.();

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.media).toMatchObject({
        remuxed: true,
        seekable: true,
        cacheStatus: "streaming",
        seekableCache: {
          status: "ready",
          startedAt: expect.any(String),
          completedAt: expect.any(String),
        },
      });
    });
    expect(retainSeekableRemux).toHaveBeenCalledTimes(1);

    await request(app)
      .get(created.body.playbackUrl)
      .set("Range", "bytes=4-7")
      .expect(204);

    expect(serveTorrentFile).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ infoHash: "abcdef123456" }),
      expect.objectContaining({
        remuxFormat: "mp4",
        remuxStrategy: "seekable-cache",
      }),
    );
  });

  it("keeps the live job ready when background seekable-cache preparation fails", async () => {
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (prepareSeekableRemux as any).mockRejectedValueOnce(
      new Error("FFmpeg cache failed"),
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.error).toBeUndefined();
      expect(status.body).toMatchObject({
        state: "ready",
        media: {
          remuxed: true,
          seekable: false,
          cacheStatus: "streaming",
          seekableCache: { status: "unavailable" },
        },
      });
    });
  });

  it("keeps progressive playback ready when adaptive cache evaluation declines", async () => {
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (evaluateSeekableRemuxPreparation as any).mockResolvedValueOnce({
      eligible: false,
      reason: "insufficient_storage",
      sourceBytes: 1024,
    });

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body).toMatchObject({
        state: "ready",
        media: {
          seekable: false,
          seekableCache: {
            status: "unavailable",
            unavailableReason: "insufficient_storage",
          },
        },
      });
    });
    expect(prepareSeekableRemux).not.toHaveBeenCalled();
  });

  it("aborts a job-owned background seekable cache when the job is cancelled", async () => {
    let cacheSignal: AbortSignal | undefined;
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (prepareSeekableRemux as any).mockImplementationOnce(
      (_torrent: unknown, options: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          cacheSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => reject(new Error("Gateway job cancelled")),
            { once: true },
          );
        }),
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);
    await vi.waitFor(() => expect(cacheSignal).toBeDefined());

    const cancelled = await request(app).delete(
      `/api/gateway/jobs/${created.body.id}`,
    );

    expect(cacheSignal?.aborted).toBe(true);
    expect(cancelled.body).toMatchObject({
      state: "cancelled",
      media: {
        seekable: false,
        seekableCache: { status: "unavailable" },
      },
    });
  });

  it("aborts a background seekable cache when a consumed job is pruned", async () => {
    let cacheSignal: AbortSignal | undefined;
    (prepareTorrent as any).mockResolvedValueOnce({
      infoHash: "abcdef123456",
      numPeers: 1,
      files: [{ name: "actual-video.mkv", streamURL: "/webtorrent/file" }],
    });
    (prepareSeekableRemux as any).mockImplementationOnce(
      (_torrent: unknown, options: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          cacheSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => reject(new Error("Gateway job expired")),
            { once: true },
          );
        }),
    );

    const created = await request(app).post("/api/gateway/jobs").send({
      magnet: "magnet:?xt=urn:btih:abcdef123456",
      remuxStrategy: "progressive-fmp4",
    });
    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    await request(app).get(created.body.playbackUrl).expect(204);
    await vi.waitFor(() => expect(cacheSignal).toBeDefined());

    __pruneGatewayJobsForTests(Date.now() + 16 * 60 * 1000);

    expect(cacheSignal?.aborted).toBe(true);
    await request(app).get(`/api/gateway/jobs/${created.body.id}`).expect(404);
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
      new Error("Torrent peer discovery timeout"),
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
        error: "No peers found quickly enough to start this source.",
      });
    });
    expect(ensureTorrentReady).toHaveBeenCalledWith(
      expect.anything(),
      32000,
      expect.objectContaining({
        initialPeerTimeoutMs: 12000,
        metadataTimeoutAfterPeerMs: 20000,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects playback for no-peers jobs without retrying torrent streaming", async () => {
    let rejectPreparation: ((error: Error) => void) | undefined;
    (ensureTorrentReady as any).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectPreparation = reject;
      }),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const preparing = await request(app).get(
      `/api/gateway/jobs/${created.body.id}`,
    );
    const playbackUrl = preparing.body.playbackUrl;
    expect(playbackUrl).toEqual(
      expect.stringMatching(/^\/api\/gateway\/jobs\//),
    );

    rejectPreparation?.(new Error("Torrent peer discovery timeout"));

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("no_peers");
    });
    vi.clearAllMocks();

    const streamed = await request(app).get(playbackUrl);

    expect(streamed.status).toBe(503);
    expect(streamed.body).toMatchObject({
      error: "No peers found quickly enough to start this source.",
      retryable: true,
      state: "no_peers",
    });
    expect(prepareTorrent).not.toHaveBeenCalled();
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("does not synthesize a terminal stalled state while metadata warmup is still active", async () => {
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
        state: "preparing",
        phase: "preparing_metadata",
        retryable: true,
        peerCount: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects playback for stalled jobs without retrying torrent streaming", async () => {
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
      expect(status.body.state).toBe("stalled");
    });
    vi.clearAllMocks();

    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(504);
    expect(streamed.body).toMatchObject({
      error: "Torrent stalled while checking piece availability.",
      retryable: true,
      state: "stalled",
    });
    expect(prepareTorrent).not.toHaveBeenCalled();
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("cancels a preparing gateway job", async () => {
    let preparationSignal: AbortSignal | undefined;
    (ensureTorrentReady as any).mockImplementationOnce(
      (
        _torrent: unknown,
        _timeoutMs: number,
        options?: { signal?: AbortSignal },
      ) =>
        new Promise<void>((_resolve, reject) => {
          preparationSignal = options?.signal;
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("Gateway job cancelled")),
            { once: true },
          );
        }),
    );

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
    expect(preparationSignal?.aborted).toBe(true);
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

  it("rejects bridge stream requests until first-byte preflight is ready", async () => {
    (waitForTorrentFileFirstBytes as any).mockReturnValueOnce(
      new Promise(() => {}),
    );

    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });
    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(425);
    expect(streamed.body).toMatchObject({
      error: "Gateway source is still preparing.",
      retryable: true,
    });
    expect(serveTorrentFile).not.toHaveBeenCalled();
  });

  it("reuses the ready torrent runtime without starting another metadata wait", async () => {
    const created = await request(app)
      .post("/api/gateway/jobs")
      .send({ magnet: "magnet:?xt=urn:btih:abcdef123456" });

    await vi.waitFor(async () => {
      const status = await request(app).get(
        `/api/gateway/jobs/${created.body.id}`,
      );
      expect(status.body.state).toBe("ready");
    });

    const readinessCalls = (ensureTorrentReady as any).mock.calls.length;
    const prepareCalls = (prepareTorrent as any).mock.calls.length;

    const streamed = await request(app).get(created.body.playbackUrl);

    expect(streamed.status).toBe(204);
    expect(ensureTorrentReady).toHaveBeenCalledTimes(readinessCalls);
    expect(prepareTorrent).toHaveBeenCalledTimes(prepareCalls);
    expect(serveTorrentFile).toHaveBeenCalled();
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
      progress: null,
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
