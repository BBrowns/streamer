import { createPlaybackPlanWithBridgeRetry } from "../PlaybackPlanService";
import { preplanNextEpisode } from "../NextEpisodePreplanner";

jest.mock("../PlaybackPlanService", () => ({
  createPlaybackPlanWithBridgeRetry: jest.fn(),
}));

describe("next episode pre-planner", () => {
  it("warms the normal play planner and only marks direct/HLS replacement safe", async () => {
    (createPlaybackPlanWithBridgeRetry as jest.Mock).mockResolvedValue({
      state: "ready",
      selectedCandidate: { kind: "hls" },
    });

    await expect(
      preplanNextEpisode({
        type: "series",
        id: "tt123",
        season: 2,
        episode: 4,
      }),
    ).resolves.toEqual({
      state: "ready",
      safeImmediateReplacement: true,
    });
    expect(createPlaybackPlanWithBridgeRetry).toHaveBeenCalledWith(
      {
        type: "series",
        id: "tt123",
        season: 2,
        episode: 4,
        action: "play",
      },
      { signal: expect.any(AbortSignal) },
    );
  });
});
