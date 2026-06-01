import type { PlaybackPlan } from "@streamer/shared";
import { streamEngineManager } from "../../streamEngine/StreamEngineManager";
import {
  getReadyPlanStreams,
  resolveFirstPlayablePlanStream,
} from "../PlaybackPlanService";

jest.mock("../../streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
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
});
