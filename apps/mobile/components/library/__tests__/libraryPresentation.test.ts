import type { LibraryItem } from "@streamer/shared";
import type { DownloadTask } from "../../../stores/downloadStore";
import {
  buildLibraryGridItems,
  canStartLibrarySelection,
  getLibraryGridMetrics,
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

function offlineTask(id: string, episode: number): DownloadTask {
  return {
    id,
    mediaInfo: {
      itemId: "series-1",
      type: "series",
      title: `Episode ${episode}`,
      episode,
    },
    progress: 1,
    status: "Completed",
    downloadedBytes: 2_000_000,
    metadataBytes: 0,
    expectedMediaBytes: 2_000_000,
    verifiedFileSizeBytes: 2_000_000,
    verificationState: "verified",
    playableState: "playable",
    localUri: `file:///episode-${episode}.mp4`,
    offlineVerifiedAt: "2026-07-15T00:00:00.000Z",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

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
          const filtered = buildLibraryGridItems(items, {}, filter);
          expect(filtered.length).toBeLessThanOrEqual(itemCount);
          const metrics = getLibraryGridMetrics(width, windowClass);
          expect(metrics.columns).toBeGreaterThanOrEqual(minimum);
          expect(metrics.columns).toBeLessThanOrEqual(maximum);
          expect(metrics.gap).toBe(16);
        }

        const offlineTasks = Object.fromEntries(
          Array.from({ length: itemCount }, (_, index) => [
            `episode-${index}`,
            offlineTask(`episode-${index}`, index + 1),
          ]),
        );
        expect(
          buildLibraryGridItems(items, offlineTasks, "offline"),
        ).toHaveLength(itemCount);
      }
    },
  );

  it("does not start selection with an empty or offline filter", () => {
    expect(canStartLibrarySelection("all", 0)).toBe(false);
    expect(canStartLibrarySelection("movie", 1)).toBe(true);
    expect(canStartLibrarySelection("offline", 2)).toBe(false);
  });

  it("filters library types and gives offline episodes unique task keys", () => {
    expect(buildLibraryGridItems(libraryItems, {}, "movie")).toHaveLength(1);
    expect(buildLibraryGridItems(libraryItems, {}, "series")).toHaveLength(1);
    expect(
      buildLibraryGridItems(libraryItems, {}, "all").map(
        (item) => item.selectionKey,
      ),
    ).toEqual(["library:db-1", "library:db-2"]);

    const offline = buildLibraryGridItems(
      libraryItems,
      { first: offlineTask("first", 1), second: offlineTask("second", 2) },
      "offline",
    );
    expect(offline.map((item) => item.selectionKey)).toEqual([
      "download:first",
      "download:second",
    ]);
  });
});
