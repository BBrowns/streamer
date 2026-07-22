import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  playbackPlanSchema,
  type DeviceProfile,
  type Stream,
} from "@streamer/shared";
import { PlaybackPlannerService } from "./playback-planner.service";
import { aggregatorService } from "../aggregator/aggregator.service";

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
    hls: false,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

const castProfile: DeviceProfile = {
  platform: "chromecast",
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

const iosProfile: DeviceProfile = {
  platform: "ios",
  maxQuality: "1080p",
  network: "local",
  supports: {
    h264: true,
    h265: true,
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

describe("PlaybackPlannerService", () => {
  let service: PlaybackPlannerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlaybackPlannerService();
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

  it("returns an explained notFound plan when no sources exist", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
      },
      "req-1",
    );

    expect(plan.state).toBe("notFound");
    expect(plan.actionEligibility).toEqual({
      action: "play",
      eligible: false,
      reason: "no_sources",
    });
    expect(plan.sourceDiscovery).toEqual({
      status: "complete",
      usableCandidateCount: 0,
    });
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("keeps a partial discovery result explicit without exposing provider details", async () => {
    vi.mocked(aggregatorService.getStreamDiscovery).mockResolvedValue({
      status: "partial",
      streams: [
        {
          url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
          title: "Movie.2026.1080p.H264.AAC.mp4",
          resolution: "1080p",
        },
      ],
    });

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
      },
      "req-partial",
    );

    expect(plan.state).toBe("ready");
    expect(plan.sourceDiscovery).toEqual({
      status: "partial",
      usableCandidateCount: 1,
    });
    expect(JSON.stringify(plan.sourceDiscovery)).not.toContain("cdn.example");
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
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
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.version).toBe(2);
    expect(plan.action).toBe("play");
    expect(plan.plan?.mode).toBe("direct");
    expect(plan.plan?.selectedCandidate.stream.url).toContain("1080p");
    expect(plan.selectedCandidate?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(plan.selectedCandidate?.id).not.toContain("cdn.example.test");
    expect(plan.decisionReasons.map((reason) => reason.code)).toContain(
      "direct_source_preferred",
    );
  });

  it("excludes unselected qualities from both selection and fallbacks", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.2160p.h264.aac.mp4",
        title: "Movie.2026.2160p.H264.AAC.mp4",
        resolution: "2160p",
      },
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie.720p.h264.aac.mp4",
        title: "Movie.2026.720p.H264.AAC.mp4",
        resolution: "720p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: { ...webProfile, maxQuality: "2160p" },
        preferences: { allowedQualities: ["2160p", "1080p"] },
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.quality).toBe("2160p");
    expect(
      plan.fallbackCandidates.map((candidate) => candidate.quality),
    ).toEqual(["1080p"]);
    expect(
      plan.orderedCandidates.map((candidate) => candidate.quality),
    ).toEqual(["2160p", "1080p"]);
    expect(plan.rejectedCandidates).toEqual([
      expect.objectContaining({ reasonCode: "quality_not_allowed" }),
    ]);
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("still excludes SD and unclassified sources when all selectable qualities are allowed", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.480p.h264.aac.mp4",
        title: "Movie.2026.480p.H264.AAC.mp4",
        resolution: "480p",
      },
      {
        url: "https://cdn.example.test/movie.h264.aac.mp4",
        title: "Movie.2026.H264.AAC.mp4",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: { ...webProfile, maxQuality: "2160p" },
        preferences: {
          allowedQualities: ["2160p", "1080p", "720p", "480p"],
        },
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.quality).toBe("480p");
    expect(plan.fallbackCandidates).toEqual([]);
    expect(plan.rejectedCandidates).toEqual([
      expect.objectContaining({
        title: "Movie.2026.H264.AAC.mp4",
        reasonCode: "quality_not_allowed",
      }),
    ]);
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("returns an explained unsupported plan when every source quality is excluded", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.720p.h264.aac.mp4",
        title: "Movie.2026.720p.H264.AAC.mp4",
        resolution: "720p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: { ...webProfile, maxQuality: "2160p" },
        preferences: { allowedQualities: ["2160p", "1080p"] },
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("unsupported");
    expect(plan.selectedCandidate).toBeUndefined();
    expect(plan.fallbackCandidates).toEqual([]);
    expect(plan.actionEligibility).toMatchObject({
      eligible: false,
      reason: "quality_not_allowed",
    });
    expect(plan.userMessage).toContain("playback qualities selected");
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("does not blame quality when another allowed source is incompatible", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.720p.h264.aac.mp4",
        title: "Movie.2026.720p.H264.AAC.mp4",
        resolution: "720p",
      },
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.m3u8",
        title: "Movie.2026.1080p.H264.AAC.HLS",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: { ...webProfile, maxQuality: "2160p" },
        preferences: { allowedQualities: ["2160p", "1080p"] },
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("unsupported");
    expect(
      plan.rejectedCandidates.map((candidate) => candidate.reasonCode),
    ).toEqual(
      expect.arrayContaining(["quality_not_allowed", "unsupported_container"]),
    );
    expect(plan.userMessage).toBe(
      "No source is compatible with this device yet.",
    );
    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("prefers a direct MP4 source for mobile play", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie/master.m3u8",
        title: "Movie.2026.1080p.H264.AAC.HLS",
        resolution: "1080p",
      },
      {
        infoHash: "torrent-hash",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
        seeders: 200,
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
        deviceProfile: iosProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.kind).toBe("direct");
    expect(plan.selectedCandidate?.stream.url).toContain(".mp4");
  });

  it("does not choose a dubbed foreign-audio source over a neutral same-quality source by default", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie-latino.m3u8",
        title: "🎬 🇲🇽 1080p (Audio Latino)",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie-english.m3u8",
        title: "🎬 1080p H264 AAC",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: iosProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.stream.title).toBe("🎬 1080p H264 AAC");
    expect(
      plan.orderedCandidates.map((candidate) => candidate.stream.title),
    ).toEqual(["🎬 1080p H264 AAC", "🎬 🇲🇽 1080p (Audio Latino)"]);
  });

  it("honors an explicit Spanish audio preference when ranking same-quality sources", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie-english.m3u8",
        title: "🎬 1080p H264 AAC English",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie-latino.m3u8",
        title: "🎬 🇲🇽 1080p (Audio Latino)",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: iosProfile,
        preferences: { preferredAudioLanguage: "es" },
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.stream.title).toBe(
      "🎬 🇲🇽 1080p (Audio Latino)",
    );
  });

  it("exposes detected audio language metadata on ordered candidates", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie-latino.m3u8",
        title: "🎬 🇲🇽 1080p (Audio Latino)",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie-english.m3u8",
        title: "🎬 🇬🇧 1080p English",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: iosProfile,
      },
      "req-1",
    );

    expect(playbackPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      plan.orderedCandidates.map((candidate) => candidate.audioLanguage),
    ).toEqual(["en", "es"]);
  });

  it("prefers multi-audio over a single foreign dubbed source when preferred language is unavailable", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie-latino.m3u8",
        title: "🎬 1080p Latino Dubbed H264 AAC",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie-multi.m3u8",
        title: "🎬 1080p MULTi Dual-Audio H264 AAC",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: iosProfile,
        preferences: { preferredAudioLanguage: "en" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.stream.title).toBe(
      "🎬 1080p MULTi Dual-Audio H264 AAC",
    );
    expect(plan.selectedCandidate?.audioLanguage).toBe("multi");
  });

  it("does not treat subtitle-only VOST labels as dubbed foreign audio", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie-vostfr.m3u8",
        title: "🎬 1080p VOSTFR H264 AAC",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie-truefrench.m3u8",
        title: "🎬 1080p TrueFrench Dubbed H264 AAC",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: iosProfile,
        preferences: { preferredAudioLanguage: "en" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.stream.title).toBe(
      "🎬 1080p VOSTFR H264 AAC",
    );
    expect(plan.selectedCandidate?.audioLanguage).toBe("unknown");
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
    expect(plan.userMessage).toBe(
      "The desktop bridge is connected, but its media runtime needs repair.",
    );
    expect(plan.requiresBridge).toBe(true);
    expect(plan.actionEligibility).toEqual({
      action: "play",
      eligible: false,
      reason: "bridge_unavailable",
      preflightReason: "bridge_runtime_unsupported",
    });
    expect(plan.rejectedCandidates[0].reasonCode).toBe("bridge_unavailable");
  });

  it("uses download-specific bridge repair guidance", async () => {
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
        action: "download",
        deviceProfile: webProfile,
        bridge: { status: "unsupported", reason: "architecture-mismatch" },
      },
      "req-1",
    );

    expect(plan.state).toBe("bridgeUnavailable");
    expect(plan.userMessage).toBe(
      "The desktop bridge is connected, but its media runtime needs repair.",
    );
  });

  it("keeps direct playback ready when only the torrent runtime is unsupported", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.mp4",
        title: "Movie.2026.1080p.H264.AAC.mp4",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: {
          status: "unsupported",
          capabilities: { gateway: true, torrent: false },
        },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.kind).toBe("direct");
    expect(plan.requiresBridge).toBe(false);
  });

  it("allows a new torrent attempt after a previous job reported no peers", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "new-candidate",
        title: "Movie.2026.1080p.H264.AAC.mp4",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "play",
        deviceProfile: webProfile,
        bridge: {
          status: "no-peers",
          capabilities: { gateway: true, torrent: true },
        },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.selectedCandidate?.kind).toBe("torrent");
  });

  it("reports torrent_no_bridge when torrent sources have no bridge configuration", async () => {
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
      },
      "req-1",
    );

    expect(plan.state).toBe("needsBridge");
    expect(plan.actionEligibility.reason).toBe("torrent_no_bridge");
    expect(plan.rejectedCandidates[0].reasonCode).toBe("torrent_no_bridge");
  });

  it("reports a known codec incompatibility before asking for a bridge", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "hevc-hash",
        title: "Movie.2026.1080p.HEVC.DDP5.1.mkv",
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
      },
      "req-1",
    );

    expect(plan.state).toBe("needsTranscode");
    expect(plan.actionEligibility.reason).toBe("unsupported_codec");
    expect(plan.rejectedCandidates[0].reasonCode).toBe("unsupported_codec");
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
    expect(plan.selectedCandidate?.requiresBridge).toBe(true);
    expect(plan.requiresBridge).toBe(true);
  });

  it("uses season and episode in the stream lookup id for series", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "episode-hash",
        title: "Show.S01E02.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "series",
        id: "tt-show",
        season: 1,
        episode: 2,
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(aggregatorService.getStreams).toHaveBeenCalledWith(
      "user-1",
      "series",
      "tt-show:1:2",
      "req-1",
    );
    expect(plan.state).toBe("ready");
    expect(plan.plan?.selectedCandidate.stream.infoHash).toBe("episode-hash");
    expect(plan.plan?.selectedCandidate.stream.fileSelectionHints).toEqual({
      season: 1,
      episode: 2,
    });
  });

  it("includes ordered fallback candidates for automatic client retry", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mp4",
        title: "Movie.2026.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/movie.720p.h264.aac.mp4",
        title: "Movie.2026.720p.H264.AAC.mp4",
        resolution: "720p",
      },
      {
        infoHash: "mkv123",
        title: "Movie.2026.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 200,
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
    expect(plan.plan?.selectedCandidate.stream.url).toContain("1080p");
    expect(plan.plan?.fallbackCandidates).toHaveLength(2);
    expect(plan.plan?.fallbackCandidates?.[0].stream.url).toContain("720p");
    expect(
      plan.plan?.fallbackCandidates?.[1].stream.behaviorHints?.remuxToMp4,
    ).toBe(true);
    expect(plan.orderedCandidates.map((candidate) => candidate.rank)).toEqual([
      0, 1, 2,
    ]);
    expect(plan.fallbackCandidates.map((candidate) => candidate.id)).toEqual(
      plan.plan?.fallbackCandidates?.map((candidate) => candidate.id),
    );
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
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
    expect(plan.requiresRemux).toBe(true);
  });

  it("allows MKV remux when FFmpeg can provide AAC audio fallback", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "abc123",
        title: "Movie.2026.1080p.H264.AC3.mkv",
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
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
    expect(
      plan.selectedCandidate?.deviceCompatibility.audioCodecSupported,
    ).toBe(true);
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
    expect(plan.rejectedCandidates[0].reasonCode).toBe(
      "hls_offline_unsupported",
    );
    expect(plan.selectedCandidate?.actionEligibility).toEqual({
      action: "download",
      eligible: true,
      preflightReason: "ready",
    });
    expect(plan.timeoutBudget.totalMs).toBeGreaterThan(
      plan.timeoutBudget.directProbeMs,
    );
  });

  it("returns deterministic source ordering when scores are equal", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/b.1080p.h264.aac.mp4",
        title: "B.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
      {
        url: "https://cdn.example.test/a.1080p.h264.aac.mp4",
        title: "A.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const request = {
      type: "movie" as const,
      id: "tt1",
      action: "play" as const,
      deviceProfile: webProfile,
      bridge: { status: "available" as const },
    };

    const first = await service.createPlan("user-1", request, "req-1");
    const second = await service.createPlan("user-1", request, "req-2");

    expect(
      first.orderedCandidates.map((candidate) => candidate.stream.title),
    ).toEqual(["A.1080p.H264.AAC.mp4", "B.1080p.H264.AAC.mp4"]);
    expect(
      second.orderedCandidates.map((candidate) => candidate.stream.title),
    ).toEqual(["A.1080p.H264.AAC.mp4", "B.1080p.H264.AAC.mp4"]);
  });

  it("keeps an explicit torrent file index zero distinct from smart file selection", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "episode-pack",
        fileIdx: 0,
        title: "Show.S01.Pack.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 100,
      },
      {
        infoHash: "episode-pack",
        title: "Show.S01.Pack.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 100,
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "series",
        id: "tt-show",
        season: 1,
        episode: 2,
        action: "play",
        deviceProfile: webProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.orderedCandidates).toHaveLength(2);
    expect(
      plan.orderedCandidates.map((candidate) => candidate.stream.fileIdx),
    ).toEqual([undefined, 0]);
  });

  it("rejects a localhost-only source for cast", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "http://localhost:11470/movie.1080p.h264.aac.mp4",
        title: "Local Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "cast",
        deviceProfile: castProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("unsupported");
    expect(plan.rejectedCandidates[0].reasonCode).toBe(
      "localhost_not_castable",
    );
    expect(plan.rejectedCandidates[0].deviceCompatibility.sourceReachable).toBe(
      false,
    );
  });

  it("rejects torrent casting through a localhost-only bridge URL", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mp4",
        resolution: "1080p",
        seeders: 100,
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "cast",
        deviceProfile: castProfile,
        bridge: { status: "available", url: "http://localhost:11470" },
      },
      "req-1",
    );

    expect(plan.state).toBe("unsupported");
    expect(plan.rejectedCandidates[0].reasonCode).toBe(
      "localhost_not_castable",
    );
  });

  it("allows torrent casting through a LAN-reachable bridge URL", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        infoHash: "torrent-hash",
        title: "Movie.1080p.H264.AAC.mkv",
        resolution: "1080p",
        seeders: 100,
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "cast",
        deviceProfile: castProfile,
        bridge: { status: "available", url: "http://192.168.1.10:11470" },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("remux");
    expect(plan.selectedCandidate?.requiresBridge).toBe(true);
    expect(plan.selectedCandidate?.requiresRemux).toBe(true);
  });

  it("rejects MKV for a cast target without MKV support", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie.1080p.h264.aac.mkv",
        title: "Movie.1080p.H264.AAC.mkv",
        resolution: "1080p",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "cast",
        deviceProfile: castProfile,
        bridge: { status: "available" },
      },
      "req-1",
    );

    expect(plan.state).toBe("unsupported");
    expect(plan.rejectedCandidates[0].reasonCode).toBe(
      "cast_device_incompatible",
    );
  });

  it("selects a remote HLS source for a compatible cast target", async () => {
    vi.mocked(aggregatorService.getStreams).mockResolvedValue([
      {
        url: "https://cdn.example.test/movie/master.m3u8",
        title: "Movie HLS",
      },
    ] as Stream[]);

    const plan = await service.createPlan(
      "user-1",
      {
        type: "movie",
        id: "tt1",
        action: "cast",
        deviceProfile: castProfile,
        bridge: {
          status: "available",
          url: "http://192.168.1.20:11470",
          capabilities: { gateway: true, cast: true },
        },
      },
      "req-1",
    );

    expect(plan.state).toBe("ready");
    expect(plan.plan?.mode).toBe("hls");
    expect(plan.selectedCandidate?.actionEligibility).toEqual({
      action: "cast",
      eligible: true,
      preflightReason: "ready",
    });
    expect(plan.decisionReasons.map((reason) => reason.code)).toContain(
      "cast_compatible_source_selected",
    );
  });
});
