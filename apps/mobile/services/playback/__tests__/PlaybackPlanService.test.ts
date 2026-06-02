import type { PlaybackPlan } from "@streamer/shared";
import { api } from "../../api";
import { streamEngineManager } from "../../streamEngine/StreamEngineManager";
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
    getBridgeUrl: jest.fn(() => "http://bridge.test"),
    getBridgeDiagnostics: jest.fn(() => ({
      status: "available",
      url: "http://bridge.test",
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
    ).mockReturnValue("http://bridge.test");
    (
      streamEngineManager.getBridgeDiagnostics as jest.MockedFunction<
        typeof streamEngineManager.getBridgeDiagnostics
      >
    ).mockReturnValue({
      status: "available",
      url: "http://bridge.test",
    });
  });

  it("includes bridge diagnostics when requesting a playback plan", async () => {
    (streamEngineManager as any).bridgeStatus = "unsupported";
    (
      streamEngineManager.getBridgeDiagnostics as jest.MockedFunction<
        typeof streamEngineManager.getBridgeDiagnostics
      >
    ).mockReturnValue({
      status: "unsupported",
      url: "http://bridge.test",
      reason: "native-architecture-mismatch",
      message: "node-datachannel was installed for another arch",
    });
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { state: "bridgeUnavailable" },
    });

    await createPlaybackPlan({ type: "movie", id: "tt123", action: "play" });

    expect(api.post).toHaveBeenCalledWith(
      "/api/playback/plan",
      expect.objectContaining({
        bridge: expect.objectContaining({
          status: "unsupported",
          url: "http://bridge.test",
          reason: "native-architecture-mismatch",
        }),
      }),
    );
  });

  it("returns selected and fallback streams in planner order", () => {
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "bridge",
        playbackUrl: "http://bridge.test/api/gateway/jobs/job-1/stream",
        selectedCandidate: {
          id: "torrent-1",
          kind: "torrent",
          stream: { infoHash: "torrent-1", title: "Torrent source" },
          riskFlags: [],
        },
        fallbackCandidates: [
          {
            id: "direct-1",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/movie.mp4",
              title: "Direct source",
            },
            riskFlags: [],
          },
        ],
      },
    };

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
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: {
          id: "stale-torrent",
          kind: "torrent",
          stream: { infoHash: "stale-torrent", title: "Stale torrent" },
          riskFlags: [],
        },
        fallbackCandidates: [
          {
            id: "direct-fallback",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/fallback.mp4",
              title: "Fallback",
            },
            riskFlags: [],
          },
        ],
      },
    };

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
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: {
          id: "dead-torrent",
          kind: "torrent",
          stream: { infoHash: "dead-torrent", title: "Dead torrent" },
          riskFlags: [],
        },
        fallbackCandidates: [
          {
            id: "empty-direct",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/empty.mp4",
              title: "Empty direct",
            },
            riskFlags: [],
          },
        ],
      },
    };

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
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "direct",
        playbackUrl: "https://cdn.example.test/first.mp4",
        selectedCandidate: {
          id: "first",
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/original-first.mp4",
            title: "First",
          },
          riskFlags: [],
        },
        fallbackCandidates: [
          {
            id: "second",
            kind: "direct",
            stream: {
              url: "https://cdn.example.test/second.mp4",
              title: "Second",
            },
            riskFlags: [],
          },
        ],
      },
    };

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
