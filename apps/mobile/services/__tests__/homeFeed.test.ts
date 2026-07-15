import type { MetaPreview, WatchProgress } from "@streamer/shared";
import { buildHomeFeed, canonicalContentKey } from "../homeFeed";

const item = (
  id: string,
  type: "movie" | "series",
  released?: string,
): MetaPreview => ({ id, type, name: id, poster: "", released });

describe("buildHomeFeed", () => {
  it("uses the most recent catalog-backed progress item as hero and deduplicates rails", () => {
    const movies = [item("a", "movie"), item("b", "movie"), item("c", "movie")];
    const series = [item("a", "series"), item("s", "series")];
    const progress = [
      {
        type: "movie",
        itemId: "a",
        currentTime: 42,
        lastWatched: "2026-07-15T06:00:00.000Z",
      } as WatchProgress,
      {
        type: "series",
        itemId: "s",
        currentTime: 120,
        lastWatched: "2026-07-14T20:00:00.000Z",
      } as WatchProgress,
    ];

    const feed = buildHomeFeed(movies, series, progress);
    const keys = [
      ...(feed.hero ? [canonicalContentKey(feed.hero)] : []),
      ...feed.rails.flatMap((rail) => rail.items.map(canonicalContentKey)),
    ];

    expect(feed.hero?.id).toBe("a");
    expect(feed.heroProgress).toBe(progress[0]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key === "movie:a")).toHaveLength(1);
    expect(keys).toContain("series:a");
    expect(keys).not.toContain("series:s");
  });

  it("falls back to the normal featured choice when progress is absent from the catalog", () => {
    const feed = buildHomeFeed(
      [item("a", "movie"), item("b", "movie")],
      [],
      [
        {
          type: "movie",
          itemId: "missing",
          lastWatched: "2026-07-15T06:00:00.000Z",
        } as WatchProgress,
      ],
    );

    expect(feed.hero?.id).toBe("a");
    expect(feed.heroProgress).toBeNull();
  });

  it("uses neutral rail semantics without inferring popularity or freshness", () => {
    const movies = Array.from({ length: 14 }, (_, index) =>
      item(
        `m${index}`,
        "movie",
        `2026-${String(12 - (index % 12)).padStart(2, "0")}-01`,
      ),
    );
    const series = Array.from({ length: 14 }, (_, index) =>
      item(
        `s${index}`,
        "series",
        `2025-${String((index % 12) + 1).padStart(2, "0")}-01`,
      ),
    );

    const feed = buildHomeFeed(movies, series);

    expect(feed.rails.map((rail) => rail.key)).toEqual([
      "movies",
      "series",
      "more_to_watch",
    ]);
    expect(feed.rails[0]?.items.map((entry) => entry.id)).toEqual(
      movies.slice(1, 13).map((entry) => entry.id),
    );
  });
});
