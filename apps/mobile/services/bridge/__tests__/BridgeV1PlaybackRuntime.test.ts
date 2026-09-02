import type {
  BridgeCapabilitiesV1,
  BridgeJobResponseV1,
  BridgeTrackCatalogV1,
  Stream,
} from "@streamer/shared";
import {
  BridgeV1PlaybackRuntime,
  type BridgeV1PlaybackRuntimeClient,
} from "../BridgeV1PlaybackRuntime";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const MEDIA_ID = "33333333-3333-4333-8333-333333333333";
const SUBTITLE_ID = "44444444-4444-4444-8444-444444444444";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";
const EXPIRES = 4_102_444_800_000;
const BASE_ORIGIN = "http://192.168.1.25:11470";
const STREAM_URI = `${BASE_ORIGIN}/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed`;

const capabilities: BridgeCapabilitiesV1 = {
  protocolVersion: 1,
  owner: "desktop",
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
    maxThumbnailBucket: 24 * 60 * 6,
    maxThumbnailBytes: 512 * 1024,
  },
};

function readyJob(
  overrides: Partial<BridgeJobResponseV1["job"]> = {},
): BridgeJobResponseV1 {
  return {
    protocolVersion: 1,
    job: {
      id: JOB_ID,
      state: "ready",
      phase: "ready",
      delivery: "progressive-fmp4",
      peerCount: 4,
      readinessProgress: 1,
      elapsedMs: 1_000,
      readyTimeoutMs: 45_000,
      media: {
        container: "mp4",
        remuxed: true,
        seek: "immediate",
        seekableCache: { status: "ready" },
      },
      stream: {
        path: `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed`,
        expiresAt: "2100-01-01T00:00:00.000Z",
      },
      ...overrides,
    },
  };
}

function trackCatalog(
  overrides: Partial<BridgeTrackCatalogV1> = {},
): BridgeTrackCatalogV1 {
  return {
    protocolVersion: 1,
    jobId: JOB_ID,
    mediaId: MEDIA_ID,
    tracks: [
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
    ],
    subtitles: [
      {
        id: SUBTITLE_ID,
        documentId: DOCUMENT_ID,
        language: "nl",
        format: "vtt",
        source: "torrent-file",
        label: "Nederlands",
        hearingImpaired: false,
        forced: false,
        fileHashMatch: false,
        fileNameMatch: true,
        contentIdMatch: false,
        confidence: 0.9,
        active: false,
      },
    ],
    ...overrides,
  };
}

function client(
  overrides: Partial<BridgeV1PlaybackRuntimeClient> = {},
): BridgeV1PlaybackRuntimeClient {
  return {
    getCapabilities: jest.fn().mockResolvedValue(capabilities),
    getJob: jest.fn().mockResolvedValue(readyJob()),
    getJobMetrics: jest.fn().mockResolvedValue({
      protocolVersion: 1,
      jobId: JOB_ID,
      sampledAt: "2026-08-01T00:00:00.000Z",
      state: "downloading",
      peers: 7,
      downloadBytesPerSecond: 2048,
      downloadedBytes: 4096,
      torrentProgress: 0.5,
    }),
    getTrackCatalog: jest.fn().mockResolvedValue(trackCatalog()),
    getSubtitleDocument: jest.fn().mockResolvedValue("WEBVTT\n\n"),
    getThumbnail: jest
      .fn()
      .mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    ...overrides,
  };
}

function runtime(runtimeClient = client()) {
  return new BridgeV1PlaybackRuntime({
    client: runtimeClient,
    baseOrigin: BASE_ORIGIN,
    jobId: JOB_ID,
    delivery: "progressive-fmp4",
    initialUri: STREAM_URI,
    now: () => 1_000_000,
    metricsPollIntervalMs: 2_000,
  });
}

describe("BridgeV1PlaybackRuntime", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("polls exact-job metrics only while a stats observer is attached", async () => {
    jest.useFakeTimers();
    const runtimeClient = client();
    const activeRuntime = runtime(runtimeClient);
    const listener = jest.fn();

    activeRuntime.on("stats", listener);
    await jest.advanceTimersByTimeAsync(0);

    expect(runtimeClient.getJobMetrics).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(AbortSignal),
    );
    expect(listener).toHaveBeenCalledWith({ speed: 2048, peers: 7 });

    activeRuntime.off("stats", listener);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(runtimeClient.getJobMetrics).toHaveBeenCalledTimes(1);
    activeRuntime.stop();
  });

  it("keeps subtitle document identities private and bound to the catalog", async () => {
    const runtimeClient = client();
    const activeRuntime = runtime(runtimeClient);

    await activeRuntime.refreshTrackCatalog();

    expect(activeRuntime.getAudioTracks()).toEqual([
      expect.objectContaining({ id: "audio:1", active: true }),
    ]);
    expect(activeRuntime.getSubtitles()).toEqual([
      expect.objectContaining({ id: SUBTITLE_ID, language: "nl" }),
    ]);
    expect(activeRuntime.getSubtitles()[0]).not.toHaveProperty("fetchIdentity");

    await expect(activeRuntime.loadSubtitleDocument(SUBTITLE_ID)).resolves.toBe(
      "WEBVTT\n\n",
    );
    expect(runtimeClient.getSubtitleDocument).toHaveBeenCalledWith(
      JOB_ID,
      DOCUMENT_ID,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxBytes: 8 * 1024 * 1024,
      }),
    );
    await expect(
      activeRuntime.loadSubtitleDocument(DOCUMENT_ID),
    ).rejects.toThrow("Subtitle is unavailable");
    activeRuntime.stop();
  });

  it("builds a signed stream variant for a supported audio track", async () => {
    const activeRuntime = runtime();
    await activeRuntime.refreshTrackCatalog();

    await expect(activeRuntime.selectAudioTrack("audio:1")).resolves.toBe(null);
    await expect(activeRuntime.selectAudioTrack("audio:2")).resolves.toBe(null);

    const secondCatalog = trackCatalog({
      tracks: [
        trackCatalog().tracks[0],
        {
          ...trackCatalog().tracks[0],
          id: "audio:2",
          streamIndex: 2,
          language: "es",
          title: "Spanish",
          default: false,
        },
      ],
    });
    const runtimeClient = client({
      getTrackCatalog: jest.fn().mockResolvedValue(secondCatalog),
    });
    const runtimeWithTracks = runtime(runtimeClient);
    await runtimeWithTracks.refreshTrackCatalog();

    const spanishUri = await runtimeWithTracks.selectAudioTrack("audio:2");
    expect(spanishUri).toBe(`${STREAM_URI}&audioTrack=2`);
    expect(
      runtimeWithTracks.getAudioTracks().find((track) => track.id === "audio:2")
        ?.active,
    ).toBe(false);
    runtimeWithTracks.commitAudioTrackSelection("audio:2", spanishUri!);
    expect(runtimeWithTracks.canPlay({ url: STREAM_URI } as Stream)).toBe(true);
    expect(runtimeWithTracks.getAudioTracks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "audio:2", active: true }),
      ]),
    );

    await expect(runtimeWithTracks.selectAudioTrack("audio:999")).resolves.toBe(
      null,
    );
    runtimeWithTracks.stop();
    activeRuntime.stop();
  });

  it("keeps the committed audio track when a replacement is not committed", async () => {
    const secondCatalog = trackCatalog({
      tracks: [
        trackCatalog().tracks[0],
        {
          ...trackCatalog().tracks[0],
          id: "audio:2",
          streamIndex: 2,
          language: "es",
          title: "Spanish",
          default: false,
        },
      ],
    });
    const activeRuntime = runtime(
      client({ getTrackCatalog: jest.fn().mockResolvedValue(secondCatalog) }),
    );
    await activeRuntime.refreshTrackCatalog();

    const pendingUri = await activeRuntime.selectAudioTrack("audio:2");
    expect(pendingUri).toBe(`${STREAM_URI}&audioTrack=2`);
    expect(
      activeRuntime.getAudioTracks().find((track) => track.active)?.id,
    ).toBe("audio:1");
    expect(activeRuntime.getActivePlaybackUri()).toBe(STREAM_URI);
    activeRuntime.stop();
  });

  it("rejects track catalogs that drift to another job or media identity", async () => {
    const runtimeClient = client({
      getTrackCatalog: jest
        .fn()
        .mockResolvedValueOnce(trackCatalog())
        .mockResolvedValueOnce(trackCatalog({ mediaId: OTHER_JOB_ID })),
    });
    const activeRuntime = runtime(runtimeClient);

    await activeRuntime.refreshTrackCatalog();
    await expect(activeRuntime.refreshTrackCatalog()).rejects.toThrow(
      "Track catalog response was invalid",
    );
    expect(activeRuntime.getSubtitles()).toHaveLength(1);
    activeRuntime.stop();
  });

  it("returns only a fresh same-job signed seekable handoff", async () => {
    const runtimeClient = client();
    const activeRuntime = runtime(runtimeClient);

    await expect(
      activeRuntime.getSeekablePlaybackHandoff({
        expectedGatewayJobId: OTHER_JOB_ID,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(runtimeClient.getJob).not.toHaveBeenCalled();

    await expect(
      activeRuntime.getSeekablePlaybackHandoff({
        expectedGatewayJobId: JOB_ID,
      }),
    ).resolves.toEqual({
      gatewayJobId: JOB_ID,
      status: "ready",
      uri: STREAM_URI,
    });
    activeRuntime.stop();
  });

  it("uses negotiated thumbnail buckets and aborts obsolete requests", async () => {
    let firstSignal: AbortSignal | undefined;
    const runtimeClient = client({
      getThumbnail: jest
        .fn()
        .mockImplementationOnce(
          (_jobId, _bucket, options) =>
            new Promise((_resolve, reject) => {
              firstSignal = options.signal;
              options.signal.addEventListener(
                "abort",
                () =>
                  reject(
                    Object.assign(new Error("cancelled"), {
                      name: "AbortError",
                    }),
                  ),
                { once: true },
              );
            }),
        )
        .mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    });
    const activeRuntime = runtime(runtimeClient);

    const stale = activeRuntime.getThumbnail(24);
    for (
      let turn = 0;
      turn < 10 &&
      (runtimeClient.getThumbnail as jest.Mock).mock.calls.length === 0;
      turn += 1
    ) {
      await Promise.resolve();
    }
    expect(runtimeClient.getThumbnail).toHaveBeenCalledTimes(1);
    const current = activeRuntime.getThumbnail(31);

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(firstSignal?.aborted).toBe(true);
    await expect(current).resolves.toEqual({
      uri: "data:image/jpeg;base64,/9j/2Q==",
    });
    expect(runtimeClient.getThumbnail).toHaveBeenLastCalledWith(
      JOB_ID,
      3,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxBytes: 512 * 1024,
      }),
    );
    activeRuntime.stop();
  });

  it("never owns bridge job cancellation", () => {
    const runtimeClient = client();
    const activeRuntime = runtime(runtimeClient);
    const preparedStream = { url: STREAM_URI } as Stream;

    expect(activeRuntime.canPlay(preparedStream)).toBe(true);
    activeRuntime.stop();

    expect(runtimeClient).not.toHaveProperty("cancelJob");
    expect(activeRuntime.canPlay(preparedStream)).toBe(false);
  });
});
