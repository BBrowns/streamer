import type { LibraryItem, WatchProgress } from "@streamer/shared";
import {
  buildLibraryGridItems,
  canStartLibrarySelection,
  getLibraryGridMetrics,
  resolveLibraryView,
} from "../libraryPresentation";

const libraryItems = [
  {
    id: "db-1",
    userId: "user-1",
    itemId: "movie-1",
    type: "movie",
    title: "Movie",
    poster: null,
    addedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "db-2",
    userId: "user-1",
    itemId: "series-1",
    type: "series",
    title: "Series",
    poster: null,
    addedAt: "2026-07-15T00:00:00.000Z",
  },
] satisfies LibraryItem[];

const historyEntries = [
  {
    id: "history-episode-one",
    userId: "user-1",
    itemId: "series-1",
    type: "series",
    season: 1,
    episode: 1,
    currentTime: 1200,
    duration: 1200,
    durationSource: "media",
    title: "Episode one",
    poster: null,
    lastWatched: "2026-07-18T10:00:00.000Z",
  },
  {
    id: "history-episode-two",
    userId: "user-1",
    itemId: "series-1",
    type: "series",
    season: 1,
    episode: 2,
    currentTime: 300,
    duration: 1200,
    durationSource: "media",
    title: "Episode two",
    poster: null,
    lastWatched: "2026-07-17T10:00:00.000Z",
  },
] satisfies WatchProgress[];

describe("libraryPresentation", () => {
  it("keeps fixed grid sizing independent of item count", () => {
    const large = getLibraryGridMetrics(1440, "large");
    expect(large.columns).toBeGreaterThanOrEqual(5);
    expect(large.columns).toBeLessThanOrEqual(7);
    expect(large.cardWidth).toBe(198);
    expect(getLibraryGridMetrics(390, "compact").columns).toBe(2);
  });

  it("keeps the same fixed card metrics for 0, 1, 2, and many items", () => {
    const metrics = [0, 1, 2, 24].map(() =>
      getLibraryGridMetrics(1440, "large"),
    );
    expect(new Set(metrics.map((value) => value.cardWidth)).size).toBe(1);
    expect(new Set(metrics.map((value) => value.columns)).size).toBe(1);
  });

  it.each([
    ["compact", 390, 2, 2],
    ["medium", 768, 3, 3],
    ["expanded", 1024, 4, 5],
    ["large", 1440, 5, 7],
  ] as const)(
    "keeps 0, 1, 2, and many %s grids within the required column range",
    (windowClass, width, minimum, maximum) => {
      for (const itemCount of [0, 1, 2, 24]) {
        const items = Array.from({ length: itemCount }, (_, index) => ({
          ...libraryItems[index % libraryItems.length],
          id: `db-${index}`,
          itemId: `item-${index}`,
        }));
        for (const filter of ["all", "movie", "series"] as const) {
          const filtered = buildLibraryGridItems(items, filter);
          expect(filtered.length).toBeLessThanOrEqual(itemCount);
          const metrics = getLibraryGridMetrics(width, windowClass);
          expect(metrics.columns).toBeGreaterThanOrEqual(minimum);
          expect(metrics.columns).toBeLessThanOrEqual(maximum);
          expect(metrics.gap).toBe(16);
        }
      }
    },
  );

  it("does not start selection with an empty or history filter", () => {
    expect(canStartLibrarySelection("all", 0)).toBe(false);
    expect(canStartLibrarySelection("movie", 1)).toBe(true);
    expect(canStartLibrarySelection("history", 2)).toBe(false);
  });

  it("filters library types without mixing in download ownership", () => {
    expect(buildLibraryGridItems(libraryItems, "movie")).toHaveLength(1);
    expect(buildLibraryGridItems(libraryItems, "series")).toHaveLength(1);
    expect(
      buildLibraryGridItems(libraryItems, "all").map(
        (item) => item.selectionKey,
      ),
    ).toEqual(["library:db-1", "library:db-2"]);
  });

  it("keeps independently watched episodes addressable by their history row id", () => {
    const history = buildLibraryGridItems(
      libraryItems,
      "history",
      historyEntries,
    );

    expect(history.map((item) => item.key)).toEqual([
      "history:history-episode-one",
      "history:history-episode-two",
    ]);
    expect(history.every((item) => item.kind === "history")).toBe(true);
    expect(history.map((item) => item.selectionKey)).toEqual([
      "history:history-episode-one",
      "history:history-episode-two",
    ]);
  });

  it("normalizes the secondary history deep link without accepting unknown views", () => {
    expect(resolveLibraryView("history")).toBe("history");
    expect(resolveLibraryView(["history"])).toBe("history");
    expect(resolveLibraryView("offline")).toBe("all");
    expect(resolveLibraryView("unknown")).toBe("all");
  });
});
