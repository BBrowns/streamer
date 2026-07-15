import { api } from "../../api";
import { streamEngineManager } from "../../streamEngine/StreamEngineManager";
import { usePlayerStore } from "../../../stores/playerStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  createPlaybackPlan,
  getReadyPlanStreams,
  resolvePlaybackPlan,
  resolveFirstPlayablePlanStream,
} from "../PlaybackPlanService";

jest.mock("../../api", () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock("../../streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    bridgeStatus: "available",
    getBridgeUrl: jest.fn(() => "http://192.168.1.25:11470"),
    getBridgeDiagnostics: jest.fn(() => ({
      status: "available",
      url: "http://192.168.1.25:11470",
    })),
    getPlaybackUri: jest.fn(),
  },
}));

describe("PlaybackPlanService", () => {
  const getPlaybackUri =
    streamEngineManager.getPlaybackUri as jest.MockedFunction<
      typeof streamEngineManager.getPlaybackUri
    >;

  beforeEach(() => {
    jest.clearAllMocks();
    (streamEngineManager as any).bridgeStatus = "available";
    (
      streamEngineManager.getBridgeUrl as jest.MockedFunction<
        typeof streamEngineManager.getBridgeUrl
      >
    ).mockReturnValue("http://192.168.1.25:11470");
    (
      streamEngineManager.getBridgeDiagnostics as jest.MockedFunction<
        typeof streamEngineManager.getBridgeDiagnostics
      >
    ).mockReturnValue({
      status: "available",
      url: "http://192.168.1.25:11470",
    });
    usePlayerStore.setState({
      preferredQualities: ["2160p", "1080p", "720p", "480p"],
      preferredAudioLang: null,
      preferredSubtitleLang: null,
      autoPlayNext: true,
    });
  });

  it("sends exact selected qualities and their upper bound to the planner", async () => {
    usePlayerStore.setState({ preferredQualities: ["2160p", "1080p"] });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: makePlaybackPlan({
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate(),
          fallbackCandidates: [],
        },
      }),
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        deviceProfile: expect.objectContaining({
          maxQuality: "2160p",
        }),
        preferences: {
          allowedQualities: ["2160p", "1080p"],
        },
      }),
    );
  });

  it("keeps all four selectable qualities as an exact allowlist", async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: makePlaybackPlan({
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate(),
          fallbackCandidates: [],
        },
      }),
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        preferences: {
          allowedQualities: ["2160p", "1080p", "720p", "480p"],
        },
      }),
    );
  });

  it("includes bridge diagnostics when requesting a playback plan", async () => {
    (streamEngineManager as any).bridgeStatus = "unsupported";
    (
      streamEngineManager.getBridgeDiagnostics as jest.MockedFunction<
        typeof streamEngineManager.getBridgeDiagnostics
      >
    ).mockReturnValue({
      status: "unsupported",
      url: "http://192.168.1.25:11470",
      reason: "native-architecture-mismatch",
      message: "node-datachannel was installed for another arch",
    });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: makePlaybackPlan({
        state: "bridgeUnavailable",
        userMessage: "Bridge is unavailable.",
      }),
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        bridge: expect.objectContaining({
          status: "unsupported",
          url: "http://192.168.1.25:11470",
          reason: "native-architecture-mismatch",
        }),
      }),
    );
  });

  it("includes the local audio language preference when requesting a playback plan", async () => {
    usePlayerStore.setState({
      preferredAudioLang: "es",
      preferredSubtitleLang: "nl",
    });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: makePlaybackPlan({
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate(),
          fallbackCandidates: [],
        },
      }),
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        preferences: expect.objectContaining({
          preferredAudioLanguage: "es",
          preferredSubtitleLanguage: "nl",
        }),
      }),
    );
  });

  it("keeps the quality allowlist while omitting empty language preferences and invalid bridge URLs", async () => {
    usePlayerStore.setState({
      preferredAudioLang: null,
      preferredSubtitleLang: null,
    });
    (
      streamEngineManager.getBridgeUrl as jest.MockedFunction<
        typeof streamEngineManager.getBridgeUrl
      >
    ).mockReturnValue("https://bridge.example.com");
    (
      streamEngineManager.getBridgeDiagnostics as jest.MockedFunction<
        typeof streamEngineManager.getBridgeDiagnostics
      >
    ).mockReturnValue({
      status: "wrong-url",
      url: "https://bridge.example.com",
      reason: "not-local-or-lan",
    });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: makePlaybackPlan({
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate(),
          fallbackCandidates: [],
        },
      }),
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        preferences: {
          allowedQualities: ["2160p", "1080p", "720p", "480p"],
        },
      }),
    );
    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        bridge: expect.objectContaining({
          status: "wrong-url",
          reason: "not-local-or-lan",
          configured: false,
          endpoint: expect.objectContaining({ scope: "remote" }),
        }),
      }),
    );
  });

  it("rejects malformed planner responses at the client boundary", async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { state: "ready" },
    });

    await expect(
      createPlaybackPlan({ type: "movie", id: "tt123", action: "play" }),
    ).rejects.toThrow();
  });

  it("returns selected and fallback streams in planner order", () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "bridge",
        playbackUrl: "http://bridge.test/api/gateway/jobs/job-1/stream",
        selectedCandidate: makePlannedMediaCandidate({
          id: "torrent-1",
          kind: "torrent",
          stream: { infoHash: "torrent-1", title: "Torrent source" },
          requiresBridge: true,
        }),
        fallbackCandidates: [
          makePlannedMediaCandidate({
            id: "direct-1",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/movie.mp4",
              title: "Direct source",
            },
            rank: 1,
          }),
        ],
      },
    });

    const streams = getReadyPlanStreams(plan);

    expect(streams).toEqual([
      {
        infoHash: "torrent-1",
        title: "Torrent source",
        url: "http://bridge.test/api/gateway/jobs/job-1/stream",
      },
      {
        url: "https://cdn.example.test/movie.mp4",
        title: "Direct source",
      },
    ]);
  });

  it("tries fallback streams when the selected source cannot resolve", async () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: makePlannedMediaCandidate({
          id: "stale-torrent",
          kind: "torrent",
          stream: { infoHash: "stale-torrent", title: "Stale torrent" },
          requiresBridge: true,
        }),
        fallbackCandidates: [
          makePlannedMediaCandidate({
            id: "direct-fallback",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/fallback.mp4",
              title: "Fallback",
            },
            rank: 1,
          }),
        ],
      },
    });

    getPlaybackUri
      .mockRejectedValueOnce(new Error("No peers found"))
      .mockResolvedValueOnce("https://cdn.example.test/fallback.mp4");

    const resolved = await resolveFirstPlayablePlanStream(plan);

    expect(getPlaybackUri).toHaveBeenCalledTimes(2);
    expect(getPlaybackUri).toHaveBeenNthCalledWith(1, {
      infoHash: "stale-torrent",
      title: "Stale torrent",
    });
    expect(getPlaybackUri).toHaveBeenNthCalledWith(2, {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    });
    expect(resolved).toEqual({
      stream: {
        url: "https://cdn.example.test/fallback.mp4",
        title: "Fallback",
      },
      uri: "https://cdn.example.test/fallback.mp4",
      attemptedStreams: 2,
      errors: ["No peers found"],
    });
  });

  it("returns resolve diagnostics when every planned source fails", async () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: makePlannedMediaCandidate({
          id: "dead-torrent",
          kind: "torrent",
          stream: { infoHash: "dead-torrent", title: "Dead torrent" },
          requiresBridge: true,
        }),
        fallbackCandidates: [
          makePlannedMediaCandidate({
            id: "empty-direct",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/empty.mp4",
              title: "Empty direct",
            },
            rank: 1,
          }),
        ],
      },
    });

    getPlaybackUri
      .mockRejectedValueOnce(new Error("No peers found"))
      .mockResolvedValueOnce("");

    const result = await resolvePlaybackPlan(plan);

    expect(result).toEqual({
      resolved: null,
      attemptedStreams: 2,
      errors: ["No peers found", "Source did not return a playback URL"],
      remainingStreams: [],
    });
  });

  it("returns remaining streams for player-level fallback after first playback failure", async () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "direct",
        playbackUrl: "https://cdn.example.test/first.mp4",
        selectedCandidate: makePlannedMediaCandidate({
          id: "first",
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/original-first.mp4",
            title: "First",
          },
        }),
        fallbackCandidates: [
          makePlannedMediaCandidate({
            id: "second",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/second.mp4",
              title: "Second",
            },
            rank: 1,
          }),
        ],
      },
    });

    getPlaybackUri.mockResolvedValueOnce("https://cdn.example.test/first.mp4");

    const result = await resolvePlaybackPlan(plan);

    expect(result.resolved?.stream).toEqual({
      url: "https://cdn.example.test/first.mp4",
      title: "First",
    });
    expect(result.remainingStreams).toEqual([
      {
        url: "https://cdn.example.test/second.mp4",
        title: "Second",
      },
    ]);
  });
});
