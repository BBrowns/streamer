import type { MetaPreview, WatchProgress } from "@streamer/shared";

export type HomeRailKey =
  | "popular_movies"
  | "top_series"
  | "recently_added"
  | "more_to_watch";

export interface HomeRailDefinition {
  key: HomeRailKey;
  items: MetaPreview[];
}

export interface HomeFeed {
  hero: MetaPreview | null;
  rails: HomeRailDefinition[];
}

export function canonicalContentKey(item: Pick<MetaPreview, "id" | "type">) {
  return `${item.type}:${item.id}`;
}

function uniqueItems(items: MetaPreview[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalContentKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function claimItems(
  candidates: MetaPreview[],
  claimed: Set<string>,
  limit = 12,
) {
  const items: MetaPreview[] = [];
  for (const item of uniqueItems(candidates)) {
    const key = canonicalContentKey(item);
    if (claimed.has(key)) continue;
    claimed.add(key);
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

function validReleaseDate(item: MetaPreview) {
  if (!item.released) return null;
  const timestamp = Date.parse(item.released);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildHomeFeed(
  movies: MetaPreview[],
  series: MetaPreview[],
  continueWatching: WatchProgress[] = [],
): HomeFeed {
  const claimed = new Set(
    continueWatching.map((item) => `${item.type}:${item.itemId}`),
  );
  const all = uniqueItems([...movies, ...series]);
  const hero =
    all.find((item) => !claimed.has(canonicalContentKey(item))) ?? null;
  if (hero) claimed.add(canonicalContentKey(hero));

  const dated = all
    .map((item) => ({ item, timestamp: validReleaseDate(item) }))
    .filter(
      (entry): entry is { item: MetaPreview; timestamp: number } =>
        entry.timestamp !== null,
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((entry) => entry.item);
  const useRecent = dated.length >= 6;
  const finalItems = claimItems(useRecent ? dated : all, claimed);
  const popularMovies = claimItems(movies, claimed);
  const topSeries = claimItems(series, claimed);

  return {
    hero,
    rails: [
      { key: "popular_movies", items: popularMovies },
      { key: "top_series", items: topSeries },
      {
        key: useRecent ? "recently_added" : "more_to_watch",
        items: finalItems,
      },
    ].filter((rail) => rail.items.length > 0) as HomeRailDefinition[],
  };
}
