import type { VideoEntry } from "@streamer/shared";
import { createNextEpisodePlan } from "../SmartDownloadPlanner";

const videos: VideoEntry[] = [
  {
    season: 1,
    episode: 1,
    id: "s1e1",
    title: "Pilot",
    released: "2026-01-01",
  },
  {
    season: 1,
    episode: 2,
    id: "s1e2",
    title: "Second",
    released: "2026-01-08",
  },
  {
    season: 2,
    episode: 1,
    id: "s2e1",
    title: "Next Season",
    released: "2026-02-01",
  },
];

describe("SmartDownloadPlanner", () => {
  it("plans the next chronological episode after a downloaded episode", () => {
    expect(
      createNextEpisodePlan({
        seriesId: "series-1",
        title: "Example Show",
        videos,
        downloadedSeason: 1,
        downloadedEpisode: 2,
      }),
    ).toMatchObject({
      seriesId: "series-1",
      title: "Example Show",
      season: 2,
      episode: 1,
      episodeTitle: "Next Season",
      status: "planned",
    });
  });

  it("returns null at the end of the series", () => {
    expect(
      createNextEpisodePlan({
        seriesId: "series-1",
        title: "Example Show",
        videos,
        downloadedSeason: 2,
        downloadedEpisode: 1,
      }),
    ).toBeNull();
  });
});
