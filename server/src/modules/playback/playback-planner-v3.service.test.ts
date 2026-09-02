import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  playbackPlanV3Schema,
  type DeviceProfile,
  type PlaybackExecutionNode,
  type PlaybackPlanV3Request,
  type PlaybackRouteCapabilities,
  type Stream,
} from "@streamer/shared";
import { aggregatorService } from "../aggregator/aggregator.service";
import { PlaybackPlannerV3Service } from "./playback-planner-v3.service";

vi.mock("../aggregator/aggregator.service", () => ({
  aggregatorService: {
    getStreams: vi.fn(),
    getStreamDiscovery: vi.fn(),
  },
}));

const webProfile: DeviceProfile = {
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

const capabilities: PlaybackRouteCapabilities = {
  seek: "immediate",
  audioTracks: true,
  embeddedSubtitles: true,
  externalSubtitles: true,
  cast: true,
  offline: true,
  thumbnails: true,
};

function node(
  overrides: Partial<PlaybackExecutionNode> = {},
): PlaybackExecutionNode {
  return {
    executionTarget: "on-device",
    availability: "available",
    acceptedSourceKinds: ["direct", "hls"],
    deliveries: [
      { delivery: "direct", capabilities },
      { delivery: "hls", capabilities },
      { delivery: "offline-file", capabilities },
    ],
    ...overrides,
  };
}

function request(
  executionNodes: PlaybackExecutionNode[],
  overrides: Partial<PlaybackPlanV3Request> = {},
): PlaybackPlanV3Request {
  return {
    version: 3,
    type: "movie",
    id: "tt1",
    action: "play",
    deviceProfile: webProfile,
    executionNodes,
    ...overrides,
  };
}

describe("PlaybackPlannerV3Service", () => {
  let service: PlaybackPlannerV3Service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlaybackPlannerV3Service();
    vi.mocked(aggregatorService.getStreamDiscovery).mockImplementation(
      async (userId, type, id, requestId) => ({
        streams: await aggregatorService.getStreams(
          userId,
          type,
          id,
          requestId,
        ),
        status: "complete",
      }),
    );
  });

  it("selects an on-device direct route without a legacy bridge hint", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([node()]),
      "req-1",
    );

    expect(plan.version).toBe(3);
    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "on-device",
      delivery: "direct",
    });
    expect(plan.selectedCandidate?.requiresBridge).toBe(false);
    expect("plan" in plan).toBe(false);
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("keeps a direct download on a direct preparation route", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([node()], { action: "download" }),
      "req-direct-download",
    );

    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "on-device",
      delivery: "direct",
      capabilities: { offline: true },
    });
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("selects the bounded HLS offline route only for Electron", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/vod/movie.m3u8",
        title: "Movie HLS VOD",
        resolution: "1080p",
      },
    ] as Stream[]);

    const desktopPlan = await service.createPlanV3(
      "user-1",
      request([node()], {
        action: "download",
        deviceProfile: { ...webProfile, platform: "electron" },
      }),
      "req-hls-desktop",
    );

    expect(desktopPlan.selectedCandidate?.route).toMatchObject({
      executionTarget: "on-device",
      delivery: "hls",
      capabilities: { offline: true },
    });
    expect(playbackPlanV3Schema.safeParse(desktopPlan).success).toBe(true);

    const webPlan = await service.createPlanV3(
      "user-1",
      request([node()], { action: "download" }),
      "req-hls-web",
    );
    expect(webPlan.selectedCandidate).toBeUndefined();
    expect(webPlan.rejectedCandidates[0]?.reasonCode).toBe(
      "hls_offline_unsupported",
    );
  });

  it("runtime-probes a torrent even when its provider label says MP4", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "local-sidecar",
          acceptedSourceKinds: ["torrent"],
          deliveries: [
            { delivery: "progressive-fmp4", capabilities },
            { delivery: "range-http", capabilities },
          ],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-2",
    );

    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "local-sidecar",
      delivery: "progressive-fmp4",
    });
    expect(plan.selectedCandidate?.requiresBridge).toBe(true);
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("selects progressive fMP4 only when a torrent needs remuxing", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AC3.mkv",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          acceptedSourceKinds: ["torrent"],
          deliveries: [{ delivery: "progressive-fmp4", capabilities }],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-3",
    );

    expect(plan.selectedCandidate?.route.delivery).toBe("progressive-fmp4");
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
    expect(plan.selectedCandidate?.stream.behaviorHints?.remuxToMp4).toBe(true);
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("selects HLS for a remuxing torrent when the bridge advertises it", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AC3.mkv",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          acceptedSourceKinds: ["torrent"],
          deliveries: [{ delivery: "hls", capabilities }],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-3-hls",
    );

    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "paired-bridge",
      delivery: "hls",
    });
    expect(plan.selectedCandidate?.stream.behaviorHints?.remuxStrategy).toBe(
      "hls",
    );
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("uses HLS to runtime-probe a torrent whose container is not trustworthy", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-unknown-container",
        title: "Series.1080p.WEB-DL.H264.AAC",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          acceptedSourceKinds: ["torrent"],
          deliveries: [{ delivery: "hls", capabilities }],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-unknown-container-hls",
    );

    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "paired-bridge",
      delivery: "hls",
    });
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
    expect(plan.selectedCandidate?.stream.behaviorHints).toMatchObject({
      remuxToMp4: true,
      remuxStrategy: "hls",
    });
  });

  it("uses progressive fMP4 for an unknown torrent when HLS is unavailable", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-unknown-container-progressive",
        title: "Series.1080p.WEB-DL.H264.AAC",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          acceptedSourceKinds: ["torrent"],
          deliveries: [{ delivery: "progressive-fmp4", capabilities }],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-unknown-container-progressive",
    );

    expect(plan.selectedCandidate?.route.delivery).toBe("progressive-fmp4");
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
  });

  it("uses seekable cache for torrent casting", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request(
        [
          node({
            executionTarget: "paired-bridge",
            acceptedSourceKinds: ["torrent"],
            deliveries: [{ delivery: "seekable-cache", capabilities }],
            bridgeProtocolVersion: 1,
          }),
        ],
        {
          action: "cast",
          deviceProfile: { ...webProfile, platform: "chromecast" },
        },
      ),
      "req-4",
    );

    expect(plan.selectedCandidate?.route.delivery).toBe("seekable-cache");
    expect(plan.selectedCandidate?.route.capabilities.cast).toBe(true);
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("uses a bridge seekable cache before copying a torrent offline", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 50,
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request(
        [
          node({
            executionTarget: "paired-bridge",
            acceptedSourceKinds: ["torrent"],
            deliveries: [{ delivery: "seekable-cache", capabilities }],
            bridgeProtocolVersion: 1,
          }),
        ],
        { action: "download" },
      ),
      "req-download",
    );

    expect(plan.selectedCandidate?.route).toMatchObject({
      executionTarget: "paired-bridge",
      delivery: "seekable-cache",
      capabilities: { offline: true },
    });
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("fails closed when the required execution target is unavailable", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          availability: "unavailable",
          acceptedSourceKinds: [],
          deliveries: [],
          bridgeProtocolVersion: 1,
        }),
      ]),
      "req-5",
    );

    expect(plan.state).toBe("bridgeUnavailable");
    expect(plan.selectedCandidate).toBeUndefined();
    expect(plan.rejectedCandidates[0]?.reasonCode).toBe(
      "execution_target_unavailable",
    );
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("rejects bridge protocol versions the server cannot execute", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request([
        node({
          executionTarget: "paired-bridge",
          acceptedSourceKinds: ["torrent"],
          deliveries: [
            { delivery: "progressive-fmp4", capabilities },
            { delivery: "range-http", capabilities },
          ],
          bridgeProtocolVersion: 2,
        }),
      ]),
      "req-6",
    );

    expect(plan.state).toBe("bridgeUnavailable");
    expect(plan.rejectedCandidates[0]?.reasonCode).toBe("protocol_unsupported");
    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(true);
  });

  it("rejects routes whose capabilities cannot perform the action", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlanV3(
      "user-1",
      request(
        [
          node({
            executionTarget: "paired-bridge",
            deliveries: [
              {
                delivery: "direct",
                capabilities: { ...capabilities, cast: false },
              },
            ],
            bridgeProtocolVersion: 1,
          }),
        ],
        {
          action: "cast",
          deviceProfile: { ...webProfile, platform: "chromecast" },
        },
      ),
      "req-7",
    );

    expect(plan.state).toBe("unsupported");
    expect(plan.rejectedCandidates[0]?.reasonCode).toBe(
      "action_capability_unsupported",
    );
  });

  it("prefers on-device execution for play when multiple routes qualify", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const paired = node({
      executionTarget: "paired-bridge",
      bridgeProtocolVersion: 1,
    });
    const onDevice = node();

    const plan = await service.createPlanV3(
      "user-1",
      request([paired, onDevice]),
      "req-8",
    );

    expect(plan.selectedCandidate?.route.executionTarget).toBe("on-device");
  });
});
