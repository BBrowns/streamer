import {
  getActivePlaybackSegment,
  loadPlaybackSegments,
  registerPlaybackSegmentsProvider,
} from "../PlaybackSegmentsProvider";

describe("PlaybackSegmentsProvider", () => {
  it("returns bounded, normalized evidence and ignores a failed provider", async () => {
    const unregisterMetadata = registerPlaybackSegmentsProvider({
      id: "metadata",
      async getSegments() {
        return [
          {
            id: "intro",
            kind: "intro",
            startSeconds: -2,
            endSeconds: 85,
            source: "metadata",
          },
          {
            id: "invalid",
            kind: "credits",
            startSeconds: 100,
            endSeconds: 90,
            source: "metadata",
          },
        ];
      },
    });
    const unregisterFailure = registerPlaybackSegmentsProvider({
      id: "failure",
      async getSegments() {
        throw new Error("provider unavailable");
      },
    });

    try {
      const segments = await loadPlaybackSegments(
        {
          type: "series",
          itemId: "series",
          season: 1,
          episode: 2,
          durationSeconds: 120,
        },
        new AbortController().signal,
      );

      expect(segments).toEqual([
        {
          id: "intro",
          kind: "intro",
          startSeconds: 0,
          endSeconds: 85,
          source: "metadata",
        },
      ]);
      expect(getActivePlaybackSegment(segments, 42)?.kind).toBe("intro");
      expect(getActivePlaybackSegment(segments, 90)).toBeNull();
    } finally {
      unregisterFailure();
      unregisterMetadata();
    }
  });

  it("returns no segments after cancellation", async () => {
    const unregister = registerPlaybackSegmentsProvider({
      id: "slow",
      async getSegments(_context, signal) {
        return await new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve([]), { once: true });
        });
      },
    });
    const controller = new AbortController();
    const promise = loadPlaybackSegments(
      { type: "movie", itemId: "movie" },
      controller.signal,
    );
    controller.abort();

    try {
      await expect(promise).resolves.toEqual([]);
    } finally {
      unregister();
    }
  });
});
