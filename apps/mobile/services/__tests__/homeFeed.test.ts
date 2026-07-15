import type { MetaPreview, WatchProgress } from "@streamer/shared";
import { buildHomeFeed, canonicalContentKey } from "../homeFeed";

const item = (
  id: string,
  type: "movie" | "series",
  released?: string,
): MetaPreview => ({ id, type, name: id, poster: "", released });

describe("buildHomeFeed", () => {
  it("deduplicates content across hero, progress and rails", () => {
    const movies = [item("a", "movie"), item("b", "movie"), item("c", "movie")];
    const series = [item("a", "series"), item("s", "series")];
    const progress = [{ type: "movie", itemId: "a" } as WatchProgress];

    const feed = buildHomeFeed(movies, series, progress);
    const keys = [
      ...(feed.hero ? [canonicalContentKey(feed.hero)] : []),
      ...feed.rails.flatMap((rail) => rail.items.map(canonicalContentKey)),
    ];

    expect(feed.hero?.id).toBe("b");
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("movie:a");
    expect(keys).toContain("series:a");
  });

  it("uses a real recently-added rail only with enough valid dates", () => {
    const movies = Array.from({ length: 8 }, (_, index) =>
      item(`m${index}`, "movie", `2026-0${(index % 8) + 1}-01`),
    );
    const feed = buildHomeFeed(movies, []);
    expect(feed.rails.at(-1)?.key).toBe("recently_added");
  });

  it("falls back to honest more-to-watch copy without date metadata", () => {
    const feed = buildHomeFeed(
      [item("a", "movie"), item("b", "movie"), item("c", "movie")],
      [],
    );
    expect(feed.rails.at(-1)?.key).toBe("more_to_watch");
  });
});
