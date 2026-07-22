import { getInitialSeriesPlaybackEpisode } from "../detailPlaybackPrefetch";

describe("getInitialSeriesPlaybackEpisode", () => {
  it("selects one earliest concrete episode without prefetching a whole series", () => {
    const episode = getInitialSeriesPlaybackEpisode([
      { id: "s2e1", season: 2, episode: 1, title: "Later" },
      { id: "s1e3", season: 1, episode: 3, title: "Third" },
      { id: "s1e1", season: 1, episode: 1, title: "First" },
    ] as any);

    expect(episode).toMatchObject({
      id: "s1e1",
      season: 1,
      episode: 1,
    });
  });

  it("does not produce a plan target when metadata has no numbered episode", () => {
    expect(
      getInitialSeriesPlaybackEpisode([
        { id: "special", season: Number.NaN, episode: 0, title: "Special" },
      ] as any),
    ).toBeUndefined();
  });
});
