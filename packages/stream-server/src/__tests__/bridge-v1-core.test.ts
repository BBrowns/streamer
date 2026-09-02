import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => {
  const jobs = new Map<string, any>();
  let nextId = 1;
  return {
    jobs,
    createGatewayJob: vi.fn(async (input: Record<string, unknown>) => {
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
      const job = { id, ...input };
      jobs.set(id, job);
      return job;
    }),
    getGatewayJob: vi.fn((jobId: string) => jobs.get(jobId)),
    buildGatewayTrackCatalog: vi.fn(),
    getGatewaySubtitleDocument: vi.fn(),
  };
});

const torrentMocks = vi.hoisted(() => ({
  getTorrentEngineStatus: vi.fn(),
  getRemuxRuntimeStatus: vi.fn(),
}));

vi.mock("../gateway.js", () => ({
  cancelGatewayJob: vi.fn(),
  buildGatewayTrackCatalog: gatewayMocks.buildGatewayTrackCatalog,
  createGatewayJob: gatewayMocks.createGatewayJob,
  getGatewayJob: gatewayMocks.getGatewayJob,
  getGatewaySubtitleDocument: gatewayMocks.getGatewaySubtitleDocument,
  serializeBridgeJobV1: vi.fn((job) => job),
  serveGatewayJobSegment: vi.fn(),
  serveGatewayJobStream: vi.fn(),
}));

vi.mock("../torrent.js", () => ({
  getTorrentEngineStatus: torrentMocks.getTorrentEngineStatus,
  getRemuxRuntimeStatus: torrentMocks.getRemuxRuntimeStatus,
  isTorrentEngineUnavailableError: vi.fn(() => false),
}));

import {
  __resetBridgeV1ForTests,
  buildBridgeCapabilitiesV1,
  buildBridgeHelloV1,
  buildBridgeTrackCatalogV1,
  createBridgeJobV1,
} from "../bridge-v1.js";
import { getBridgeOperationalMetricsSnapshot } from "../bridge-metrics.js";

const REQUEST_ID = "00000000-0000-4000-8000-000000000051";

describe("bridge v1 application contract", () => {
  beforeEach(() => {
    __resetBridgeV1ForTests();
    gatewayMocks.jobs.clear();
    gatewayMocks.createGatewayJob.mockClear();
    gatewayMocks.getGatewayJob.mockClear();
    gatewayMocks.buildGatewayTrackCatalog.mockReset();
    gatewayMocks.getGatewaySubtitleDocument.mockReset();
    torrentMocks.getTorrentEngineStatus.mockReturnValue({
      available: true,
      state: "ready",
      processArch: "arm64",
      platform: "darwin",
    });
    torrentMocks.getRemuxRuntimeStatus.mockResolvedValue({
      available: true,
      state: "ready",
      binaryPath: "/private/runtime/ffmpeg",
      processArch: "arm64",
      platform: "darwin",
    });
  });

  it("keeps hello and capabilities free of runtime paths", async () => {
    const hello = buildBridgeHelloV1();
    const capabilities = await buildBridgeCapabilitiesV1();

    expect(hello).toEqual({
      protocol: {
        name: "streamer-bridge",
        current: 1,
        supported: [1],
      },
      serviceVersion: expect.any(String),
      auth: {
        required: true,
        methods: ["bearer", "x-streamer-bridge-token"],
      },
    });
    expect(capabilities.health).toBe("ready");
    expect(JSON.stringify(capabilities)).not.toContain("ffmpeg");
    expect(JSON.stringify(capabilities)).not.toContain("/private/");
  });

  it("advertises HLS only for clients that explicitly request the feature", async () => {
    const legacy = await buildBridgeCapabilitiesV1();
    const optedIn = await buildBridgeCapabilitiesV1({ hlsSegments: true });
    const legacyDeliveries = legacy.capabilities.jobs.deliveries.map(
      (entry) => entry.delivery,
    );
    const optedInDeliveries = optedIn.capabilities.jobs.deliveries.map(
      (entry) => entry.delivery,
    );

    expect(legacyDeliveries).not.toContain("hls");
    expect(optedInDeliveries).toContain("hls");
  });

  it("reports the API supervisor with the canonical bridge owner", async () => {
    const previousOwner = process.env.STREAMER_BRIDGE_OWNER;
    process.env.STREAMER_BRIDGE_OWNER = "api-supervisor";

    try {
      await expect(buildBridgeCapabilitiesV1()).resolves.toMatchObject({
        owner: "api-supervisor",
      });
    } finally {
      if (previousOwner === undefined) {
        delete process.env.STREAMER_BRIDGE_OWNER;
      } else {
        process.env.STREAMER_BRIDGE_OWNER = previousOwner;
      }
    }
  });

  it("maps delivery into the existing gateway lifecycle", async () => {
    const result = await createBridgeJobV1("principal-1", {
      requestId: REQUEST_ID,
      source: {
        kind: "magnet",
        magnet: "magnet:?xt=urn:btih:abcdef",
      },
      delivery: "progressive-fmp4",
      selection: {
        fileIndex: 0,
        season: 1,
        episode: 2,
      },
    });

    expect(result.kind).toBe("job");
    expect(gatewayMocks.createGatewayJob).toHaveBeenCalledWith({
      magnet: "magnet:?xt=urn:btih:abcdef",
      fileIdx: 0,
      hints: {
        title: undefined,
        season: 1,
        episode: 2,
      },
      mode: "remux",
      remuxStrategy: "progressive-fmp4",
      requestedDelivery: "progressive-fmp4",
    });
  });

  it("reuses an identical idempotent request and rejects payload drift", async () => {
    const input = {
      requestId: REQUEST_ID,
      source: {
        kind: "magnet" as const,
        magnet: "magnet:?xt=urn:btih:abcdef",
      },
      delivery: "range-http" as const,
    };

    const first = await createBridgeJobV1("principal-1", input);
    const second = await createBridgeJobV1("principal-1", input);
    const conflict = await createBridgeJobV1("principal-1", {
      ...input,
      delivery: "seekable-cache",
    });

    expect(first).toMatchObject({ kind: "job", reused: false });
    expect(second).toMatchObject({
      kind: "job",
      reused: true,
      job: first.kind === "job" ? first.job : undefined,
    });
    expect(conflict).toEqual({ kind: "conflict" });
    expect(gatewayMocks.createGatewayJob).toHaveBeenCalledTimes(1);
    expect(
      getBridgeOperationalMetricsSnapshot().counters.idempotency_conflict,
    ).toBe(1);
  });

  it("replaces subtitle transport identities with stable job-scoped UUIDs", async () => {
    const created = await createBridgeJobV1("principal-1", {
      requestId: REQUEST_ID,
      source: {
        kind: "magnet",
        magnet: "magnet:?xt=urn:btih:abcdef",
      },
      delivery: "range-http",
    });
    if (created.kind !== "job") throw new Error("Expected bridge job");
    gatewayMocks.buildGatewayTrackCatalog.mockResolvedValue({
      jobId: created.job.id,
      selectedFileIndex: 0,
      tracks: [],
      subtitles: [
        {
          id: "embedded:3",
          language: "en",
          format: "vtt",
          source: "embedded",
          label: "English",
          hearingImpaired: false,
          forced: false,
          fileHashMatch: true,
          fileNameMatch: true,
          contentIdMatch: false,
          confidence: 0.95,
          active: false,
          fetchIdentity: "embedded:3",
        },
      ],
    });

    const first = await buildBridgeTrackCatalogV1(created.job);
    const second = await buildBridgeTrackCatalogV1(created.job);

    expect(first.mediaId).toBe(second.mediaId);
    expect(first.subtitles[0].id).toBe(second.subtitles[0].id);
    expect(first.subtitles[0].documentId).toBe(second.subtitles[0].documentId);
    expect(first.subtitles[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(first)).not.toContain("embedded:3");
    expect(JSON.stringify(first)).not.toContain("fetchIdentity");
  });
});
