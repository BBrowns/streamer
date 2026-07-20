import type {
  AddonManifest,
  CatalogDefinition,
  MetaPreview,
} from "@streamer/shared";
import { supportsCatalogType } from "@streamer/shared";

export type SearchContentType = "all" | "movie" | "series";
export type SearchMode = "suggestions" | "results";

export interface SearchCandidate {
  meta: MetaPreview;
  providerId: string;
}

export interface RankedSearchCandidates {
  metas: MetaPreview[];
  providersByContent: Record<string, string[]>;
}

export class SearchOutboundBudgetExceededError extends Error {
  constructor() {
    super("Search outbound capacity is temporarily exhausted.");
    this.name = "SearchOutboundBudgetExceededError";
  }
}

type QueuedSearchWork = {
  start: () => void;
  cancel: () => void;
};

/**
 * A process-wide, bounded semaphore for search provider calls. Per-provider
 * bulkheads still isolate individual add-ons; this budget prevents many
 * distinct searches from multiplying outbound work without limit.
 */
export class SearchOutboundBudget {
  private active = 0;
  private readonly queue: QueuedSearchWork[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {
    if (maxConcurrent < 1 || maxQueued < 0) {
      throw new Error("Search outbound budget limits must be positive.");
    }
  }

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let queuedWork: QueuedSearchWork | undefined;
      let settled = false;

      const cancelQueued = () => {
        if (settled) return;
        settled = true;
        const index = queuedWork ? this.queue.indexOf(queuedWork) : -1;
        if (index >= 0) this.queue.splice(index, 1);
        signal?.removeEventListener("abort", cancelQueued);
        reject(signal?.reason ?? new Error("Search request cancelled."));
      };

      const start = () => {
        if (settled) return;
        signal?.removeEventListener("abort", cancelQueued);
        if (signal?.aborted) {
          cancelQueued();
          return;
        }
        this.active += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            settled = true;
            this.release();
          });
      };

      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Search request cancelled."));
        return;
      }
      if (this.active < this.maxConcurrent) {
        start();
        return;
      }
      if (this.queue.length >= this.maxQueued) {
        reject(new SearchOutboundBudgetExceededError());
        return;
      }

      queuedWork = { start, cancel: cancelQueued };
      this.queue.push(queuedWork);
      signal?.addEventListener("abort", cancelQueued, { once: true });
    });
  }

  getState() {
    return { active: this.active, queued: this.queue.length };
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      next.start();
      return;
    }
  }
}

type SearchableContentType = Exclude<SearchContentType, "all">;

/**
 * Returns only catalogs that explicitly declare Stremio's `search` extra.
 * A catalog being first (or merely existing) is not evidence that it accepts
 * a search parameter.
 */
export function getSearchableCatalogs(
  manifest: AddonManifest,
  requestedType?: SearchableContentType,
): CatalogDefinition[] {
  return manifest.catalogs.filter((catalog) => {
    if (catalog.type !== "movie" && catalog.type !== "series") return false;
    if (requestedType && catalog.type !== requestedType) return false;
    if (!supportsCatalogType(manifest, catalog.type, catalog.id)) return false;
    // Catalog definitions are the authoritative capability declaration here.
    // Some deployed Stremio add-ons expose working catalog routes but omit
    // `catalog` from `resources`; requiring both would create false negatives.
    return (catalog.extra ?? []).some(
      (extra) => extra.name.trim().toLowerCase() === "search",
    );
  });
}

/** Normalizes user and provider text for stable, accent-insensitive matching. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getReleaseYear(meta: MetaPreview): number | undefined {
  const source = `${meta.releaseInfo ?? ""} ${meta.released ?? ""}`;
  const match = source.match(/\b(18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function getAlternativeTitles(meta: MetaPreview): string[] {
  return [meta.aliases, meta.alternativeTitles]
    .flatMap((titles) => titles ?? [])
    .filter((title): title is string => typeof title === "string");
}

function parseSearchQuery(query: string) {
  const normalized = normalizeSearchText(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const yearToken = tokens.find((token) => /^(18|19|20|21)\d{2}$/.test(token));
  const titleTokens = tokens.filter((token) => token !== yearToken);

  return {
    normalized,
    normalizedTitle: titleTokens.join(" "),
    titleTokens,
    requestedYear: yearToken ? Number(yearToken) : undefined,
  };
}

function ratingValue(meta: MetaPreview): number {
  const rating = Number.parseFloat(meta.imdbRating ?? "");
  return Number.isFinite(rating) ? rating : 0;
}

function metadataCompletenessValue(meta: MetaPreview): number {
  let score = 0;
  if (meta.poster.trim().length > 0) score += 10_000;
  if (meta.releaseInfo) score += 1_000;
  if (meta.released) score += 1_000;
  if (meta.imdbRating) score += 500;
  if (meta.description) {
    score += 100 + Math.min(meta.description.trim().length, 500);
  }
  score += Math.min(meta.aliases?.length ?? 0, 20) * 10;
  score += Math.min(meta.alternativeTitles?.length ?? 0, 20) * 10;
  return score;
}

function stableMetadataKey(meta: MetaPreview): string {
  return JSON.stringify([
    meta.type,
    meta.id,
    normalizeSearchText(meta.name),
    meta.poster,
    meta.releaseInfo ?? "",
    meta.released ?? "",
    meta.imdbRating ?? "",
    meta.description ?? "",
    [...(meta.aliases ?? [])].sort(),
    [...(meta.alternativeTitles ?? [])].sort(),
  ]);
}

interface SearchRepresentative {
  meta: MetaPreview;
  score: number;
  representativeProviderId: string;
  providerIds: Set<string>;
}

function isBetterRepresentative(
  candidate: SearchCandidate,
  candidateScore: number,
  existing: SearchRepresentative,
) {
  if (candidateScore !== existing.score) return candidateScore > existing.score;

  const candidateRating = ratingValue(candidate.meta);
  const existingRating = ratingValue(existing.meta);
  if (candidateRating !== existingRating)
    return candidateRating > existingRating;

  const candidateCompleteness = metadataCompletenessValue(candidate.meta);
  const existingCompleteness = metadataCompletenessValue(existing.meta);
  if (candidateCompleteness !== existingCompleteness) {
    return candidateCompleteness > existingCompleteness;
  }

  const nameComparison = normalizeSearchText(candidate.meta.name).localeCompare(
    normalizeSearchText(existing.meta.name),
  );
  if (nameComparison !== 0) return nameComparison < 0;

  const metadataComparison = stableMetadataKey(candidate.meta).localeCompare(
    stableMetadataKey(existing.meta),
  );
  if (metadataComparison !== 0) return metadataComparison < 0;

  return (
    candidate.providerId.localeCompare(existing.representativeProviderId) < 0
  );
}

/**
 * Pure relevance score. Tier gaps are deliberately larger than all bonuses so
 * an exact/prefix/token class can never be displaced by provider ordering.
 */
export function scoreSearchResult(meta: MetaPreview, query: string): number {
  const parsed = parseSearchQuery(query);
  const needle = parsed.normalizedTitle || parsed.normalized;
  const title = normalizeSearchText(meta.name);
  const alternatives = getAlternativeTitles(meta).map(normalizeSearchText);

  let score = 0;
  if (needle && title === needle) {
    score = 6_000;
  } else if (needle && alternatives.includes(needle)) {
    score = 5_000;
  } else if (needle && title.startsWith(needle)) {
    score = 4_000;
  } else if (
    parsed.titleTokens.length > 0 &&
    parsed.titleTokens.every((token) => title.split(" ").includes(token))
  ) {
    score = 3_000;
  } else if (
    parsed.titleTokens.some((token) =>
      title.split(" ").some((titleToken) => titleToken.includes(token)),
    )
  ) {
    const matchedTokens = parsed.titleTokens.filter((token) =>
      title.split(" ").some((titleToken) => titleToken.includes(token)),
    ).length;
    score = 2_000 + Math.min(matchedTokens, 9) * 10;
  } else {
    score = 1_000;
  }

  if (
    parsed.requestedYear !== undefined &&
    getReleaseYear(meta) === parsed.requestedYear
  ) {
    score += 100;
  }

  return score;
}

/** Deduplicates by canonical type/id, merges provenance, and ranks stably. */
export function rankSearchCandidates(
  candidates: SearchCandidate[],
  query: string,
): RankedSearchCandidates {
  const grouped = new Map<string, SearchRepresentative>();

  for (const candidate of candidates) {
    const key = `${candidate.meta.type}:${candidate.meta.id}`;
    const candidateScore = scoreSearchResult(candidate.meta, query);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        meta: candidate.meta,
        score: candidateScore,
        representativeProviderId: candidate.providerId,
        providerIds: new Set([candidate.providerId]),
      });
      continue;
    }

    existing.providerIds.add(candidate.providerId);
    if (isBetterRepresentative(candidate, candidateScore, existing)) {
      existing.meta = candidate.meta;
      existing.score = candidateScore;
      existing.representativeProviderId = candidate.providerId;
    }
  }

  const ranked = Array.from(grouped.entries()).sort(
    ([keyA, itemA], [keyB, itemB]) =>
      itemB.score - itemA.score ||
      ratingValue(itemB.meta) - ratingValue(itemA.meta) ||
      normalizeSearchText(itemA.meta.name).localeCompare(
        normalizeSearchText(itemB.meta.name),
      ) ||
      keyA.localeCompare(keyB),
  );

  return {
    metas: ranked.map(([, item]) => item.meta),
    providersByContent: Object.fromEntries(
      ranked.map(([key, item]) => [key, Array.from(item.providerIds).sort()]),
    ),
  };
}
