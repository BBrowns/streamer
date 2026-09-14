import {
  getInitialSeriesPlaybackEpisode,
  parseEpisodeRouteParams,
} from "../detailPlaybackPrefetch";

const videos = [
  { id: "s0e2", season: 0, episode: 2, title: "Second special" },
  { id: "s2e1", season: 2, episode: 1, title: "Later season" },
  { id: "s1e3", season: 1, episode: 3, title: "Third episode" },
  { id: "s0e1", season: 0, episode: 1, title: "First special" },
  { id: "s1e1", season: 1, episode: 1, title: "First episode" },
];

describe("getInitialSeriesPlaybackEpisode", () => {
  it("defaults to the first regular season when Specials are also available", () => {
    expect(getInitialSeriesPlaybackEpisode(videos)?.id).toBe("s1e1");
    expect(videos[0].id).toBe("s0e2");
  });

  it("defaults to the first special for a specials-only series", () => {
    expect(
      getInitialSeriesPlaybackEpisode(videos.filter((v) => v.season === 0))?.id,
    ).toBe("s0e1");
  });

  it.each([
    [0, 2, "s0e2"],
    [1, 3, "s1e3"],
    [2, 1, "s2e1"],
  ])("preserves an explicit S%s E%s selection", (season, episode, id) => {
    expect(
      getInitialSeriesPlaybackEpisode(videos, { season, episode })?.id,
    ).toBe(id);
  });

  it("does not substitute a different episode for missing explicit metadata", () => {
    expect(
      getInitialSeriesPlaybackEpisode(videos, { season: 3, episode: 1 }),
    ).toBeUndefined();
  });

  it.each([
    [-1, 1],
    [0.5, 1],
    [1, -1],
    [1, 0],
    [1, 1.5],
    [Infinity, 1],
    [0, NaN],
  ])("excludes invalid S%s E%s metadata", (season, episode) => {
    expect(
      getInitialSeriesPlaybackEpisode([
        { id: "invalid", title: "Invalid", season, episode },
      ]),
    ).toBeUndefined();
  });
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

describe("parseEpisodeRouteParams", () => {
  it("preserves season zero from a recovery or resume deep link", () => {
    expect(parseEpisodeRouteParams("0", "2")).toEqual({
      season: 0,
      episode: 2,
    });
  });

  it.each([
    ["-1", "1"],
    ["0.5", "1"],
    ["1", "-1"],
    ["1", "0"],
    ["1", "1.5"],
    ["", "1"],
    ["1", undefined],
    [undefined, "1"],
    ["Infinity", "1"],
    ["NaN", "1"],
    [["0", "1"], "2"],
  ])(
    "rejects incomplete or malformed route coordinates %s/%s",
    (season, episode) => {
      expect(parseEpisodeRouteParams(season, episode)).toBeUndefined();
    },
  );
});
