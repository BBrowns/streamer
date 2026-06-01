import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceProfile, Stream } from "@streamer/shared";
import { PlaybackPlannerService } from "./playback-planner.service";
import { aggregatorService } from "../aggregator/aggregator.service";

vi.mock("../aggregator/aggregator.service", () => ({
  aggregatorService: {
    getStreams: vi.fn(),
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
    hls: false,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

describe("PlaybackPlannerService", () => {
  let service: PlaybackPlannerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlaybackPlannerService();
  });

  it("chooses a playable H.264 source over an incompatible 4K HEVC/DV source", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "hevc-hash",
        title: "Movie.2026.2160p.DV.HDR.HEVC.DDP5.1.mkv",
        resolution: "2160p",
        seeders: 500,
      },
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("direct");
    expect(plan.plan?.selectedCandidate.stream.url).toContain("1080p");
  });

  it("reports bridgeUnavailable when only torrent sources exist and bridge runtime is unsupported", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "abc123",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "unsupported", reason: "architecture-mismatch" },
      },
      "req-1",
    );

    expect(plan.state).toBe("bridgeUnavailable");
    expect(plan.userMessage).toContain("repair");
  });

  it("returns a bridge plan for compatible torrent sources when bridge is available", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "abc123",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
        seeders: 100,
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("bridge");
    expect(plan.plan?.selectedCandidate.stream.infoHash).toBe("abc123");
  });

  it("marks MKV torrent sources for remux when the device needs MP4", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "abc123",
        title: "Movie.2026.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 100,
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("remux");
    expect(plan.plan?.selectedCandidate.stream.behaviorHints?.remuxToMp4).toBe(
      true,
    );
  });

  it("rejects HLS for download and chooses a direct offline-playable source", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.m3u8",
        title: "Movie HLS",
      },
      {
        url: "https://cdn.example.test/movie.720p.h264.aac.mp4",
        title: "Movie.720p.H264.AAC.mp4",
        resolution: "720p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "download",
        deviceProfile: webProfile,
        bridge: { status: "unreachable" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("direct");
    expect(plan.plan?.selectedCandidate.stream.url).toContain(".mp4");
    expect(plan.debug?.rejectedCandidates[0].reason).toContain("HLS");
  });
});
