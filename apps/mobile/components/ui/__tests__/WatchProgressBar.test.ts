import type { WatchProgress } from "@streamer/shared";
import { selectCatalogProgress } from "../WatchProgressBar";

function progress(overrides: Partial<WatchProgress> = {}): WatchProgress {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    type: "series",
    itemId: "tt-series",
    season: 1,
    episode: 1,
    currentTime: 120,
    duration: 600,
    durationSource: "media",
    title: "Example Series",
    lastWatched: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("selectCatalogProgress", () => {
  it("selects the most recently watched episode for a series card", () => {
    const older = progress({ episode: 1 });
    const newer = progress({
      id: "00000000-0000-4000-8000-000000000003",
      episode: 2,
      lastWatched: "2026-09-02T10:00:00.000Z",
    });

    expect(selectCatalogProgress([older, newer], "tt-series", "series")).toBe(
      newer,
    );
  });

  it("keeps movie and series progress identities separate", () => {
    const movie = progress({
      id: "00000000-0000-4000-8000-000000000004",
      type: "movie",
      itemId: "tt-shared",
    });
    const series = progress({
      id: "00000000-0000-4000-8000-000000000005",
      type: "series",
      itemId: "tt-shared",
    });

    expect(selectCatalogProgress([movie, series], "tt-shared", "movie")).toBe(
      movie,
    );
    expect(selectCatalogProgress([movie, series], "tt-shared", "series")).toBe(
      series,
    );
  });

  it("returns no progress when the catalog item has no matching record", () => {
    expect(selectCatalogProgress([progress()], "tt-other", "series")).toBe(
      null,
    );
  });
});
