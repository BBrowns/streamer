import type { MetaPreview, WatchProgress } from "@streamer/shared";

export type HomeRailKey = "movies" | "series" | "more_to_watch";

export interface HomeRailDefinition {
  key: HomeRailKey;
  items: MetaPreview[];
}

export interface HomeFeed {
  hero: MetaPreview | null;
  heroProgress: WatchProgress | null;
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

export function buildHomeFeed(
  movies: MetaPreview[],
  series: MetaPreview[],
  continueWatching: WatchProgress[] = [],
): HomeFeed {
  const all = uniqueItems([...movies, ...series]);
  const catalogByKey = new Map(
    all.map((item) => [canonicalContentKey(item), item] as const),
  );
  const heroProgress =
    [...continueWatching]
      .filter((progress) =>
        catalogByKey.has(`${progress.type}:${progress.itemId}`),
      )
      .sort((left, right) => {
        const leftTime = Date.parse(left.lastWatched || "") || 0;
        const rightTime = Date.parse(right.lastWatched || "") || 0;
        return rightTime - leftTime;
      })[0] ?? null;
  const claimed = new Set(
    continueWatching.map((item) => `${item.type}:${item.itemId}`),
  );
  const hero = heroProgress
    ? (catalogByKey.get(`${heroProgress.type}:${heroProgress.itemId}`) ?? null)
    : (all.find((item) => !claimed.has(canonicalContentKey(item))) ??
      all[0] ??
      null);
  if (hero) claimed.add(canonicalContentKey(hero));

  const movieItems = claimItems(movies, claimed);
  const seriesItems = claimItems(series, claimed);
  const moreToWatch = claimItems(all, claimed);

  return {
    hero,
    heroProgress,
    rails: [
      { key: "movies", items: movieItems },
      { key: "series", items: seriesItems },
      { key: "more_to_watch", items: moreToWatch },
    ].filter((rail) => rail.items.length > 0) as HomeRailDefinition[],
  };
}
