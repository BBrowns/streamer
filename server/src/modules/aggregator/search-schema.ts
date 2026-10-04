import { z } from "zod";
import { metaPreviewSchema, type SearchResponse } from "@streamer/shared";
import {
  SearchOutboundBudget,
  type SearchContentType,
  type SearchMode,
} from "./search.js";

export const SEARCH_CACHE_TTL_MS = 15_000;
export const DEGRADED_SEARCH_CACHE_TTL_MS = 2_000;
export const SUGGESTION_TIMEOUT_MS = 1_800;
export const RESULT_TIMEOUT_MS = 4_500;
export const SUGGESTION_LIMIT = 6;
export const RESULT_LIMIT = 40;
export const SEARCH_CACHE_MAX_ENTRIES = 250;
export const SEARCH_CACHE_MAX_BYTES = 24 * 1024 * 1024;
export const SEARCH_CACHE_MAX_ENTRY_BYTES = 5 * 1024 * 1024;
export const SEARCH_SNAPSHOT_TTL_MS = 5 * 60_000;
export const SEARCH_SNAPSHOT_MAX_ENTRIES = 100;
export const SEARCH_SNAPSHOT_MAX_BYTES = 24 * 1024 * 1024;
export const MAX_SEARCH_ADDON_SCAN = 64;
export const MAX_SEARCH_PROVIDERS = 16;
export const MAX_SEARCH_CATALOGS_PER_ADDON = 4;
export const MAX_SEARCH_ATTEMPTS = 32;
export const MAX_RESULTS_PER_SEARCH_ATTEMPT = 200;
export const MAX_SEARCH_CANDIDATES = 2_000;
export const MAX_SEARCH_CANDIDATE_BYTES = 4 * 1024 * 1024;
export const MAX_SEARCH_RESPONSE_BYTES = 512 * 1024;
export const MAX_SEARCH_ID_LENGTH = 512;
export const MAX_SEARCH_NAME_LENGTH = 512;
export const MAX_SEARCH_URL_LENGTH = 4_096;
export const MAX_SEARCH_DESCRIPTION_LENGTH = 8_192;
export const MAX_SEARCH_SHORT_TEXT_LENGTH = 128;
export const MAX_SEARCH_TITLE_ALIASES = 32;
export const MAX_SEARCH_ALIAS_LENGTH = 512;
export const MAX_SEARCH_PROVIDER_NAME_LENGTH = 256;
export const MAX_SEARCH_FACETS = 16;
export const MAX_SEARCH_FACET_LENGTH = 64;
export const GLOBAL_SEARCH_MAX_CONCURRENT = 8;
export const GLOBAL_SEARCH_MAX_QUEUED = 64;
export const searchOutboundBudget = new SearchOutboundBudget(
  GLOBAL_SEARCH_MAX_CONCURRENT,
  GLOBAL_SEARCH_MAX_QUEUED,
);

const boundedOptionalShortStringFromPrimitive = z
  .union([z.string().max(MAX_SEARCH_SHORT_TEXT_LENGTH), z.number()])
  .nullish()
  .transform((value) =>
    value === undefined || value === null ? undefined : String(value),
  );

const boundedOptionalString = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .nullish()
    .transform((value) => value ?? undefined);

const boundedOptionalStringArray = z
  .array(z.string().max(MAX_SEARCH_ALIAS_LENGTH))
  .max(MAX_SEARCH_TITLE_ALIASES)
  .nullish()
  .transform((value) => value ?? undefined);

function normalizeBoundedFacetList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SEARCH_FACETS)
      .map((entry) =>
        typeof entry === "string"
          ? entry.trim().slice(0, MAX_SEARCH_FACET_LENGTH)
          : entry,
      )
      .filter((entry) => typeof entry === "string" && entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",", MAX_SEARCH_FACETS + 1)
      .map((entry) => entry.trim().slice(0, MAX_SEARCH_FACET_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_SEARCH_FACETS);
  }
  return value;
}

const boundedOptionalFacetArray = z.preprocess(
  normalizeBoundedFacetList,
  z
    .array(z.string().min(1).max(MAX_SEARCH_FACET_LENGTH))
    .max(MAX_SEARCH_FACETS)
    .nullish()
    .transform((value) =>
      value == null
        ? undefined
        : Array.from(new Set(value.map((entry) => entry.trim()))),
    ),
);

const boundedSearchMetaPreviewSchema = metaPreviewSchema.extend({
  id: z.string().min(1).max(MAX_SEARCH_ID_LENGTH),
  type: z.enum(["movie", "series"]),
  name: z.string().min(1).max(MAX_SEARCH_NAME_LENGTH),
  poster: z
    .string()
    .max(MAX_SEARCH_URL_LENGTH)
    .nullish()
    .transform((value) => value ?? ""),
  description: boundedOptionalString(MAX_SEARCH_DESCRIPTION_LENGTH),
  releaseInfo: boundedOptionalShortStringFromPrimitive,
  released: boundedOptionalString(MAX_SEARCH_SHORT_TEXT_LENGTH),
  imdbRating: boundedOptionalShortStringFromPrimitive,
  aliases: boundedOptionalStringArray,
  alternativeTitles: boundedOptionalStringArray,
  genres: boundedOptionalFacetArray,
  originalLanguage: boundedOptionalString(MAX_SEARCH_FACET_LENGTH),
});

function normalizeBoundedSearchMetas(value: unknown) {
  if (!Array.isArray(value)) return value;

  const metas = value.flatMap((entry) => {
    const parsed = boundedSearchMetaPreviewSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });

  // A complete non-empty malformed response is still a provider failure. This
  // preserves existing partial-failure semantics while one bad title can no
  // longer discard the rest of a provider catalog or trip its circuit.
  return metas.length > 0 || value.length === 0 ? metas : value;
}

export const strictSearchCatalogResponseSchema = z.object({
  metas: z.preprocess(
    normalizeBoundedSearchMetas,
    z.array(boundedSearchMetaPreviewSchema).max(MAX_RESULTS_PER_SEARCH_ATTEMPT),
  ),
});

function boundSearchString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength + 1) : value;
}

function boundSearchStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SEARCH_TITLE_ALIASES + 1)
      .map((entry) => boundSearchString(entry, MAX_SEARCH_ALIAS_LENGTH));
  }
  if (typeof value === "string") {
    return value
      .split(",", MAX_SEARCH_TITLE_ALIASES + 1)
      .map((entry) => entry.trim().slice(0, MAX_SEARCH_ALIAS_LENGTH + 1))
      .filter(Boolean);
  }
  return value;
}

function boundSearchFacetList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SEARCH_FACETS + 1)
      .map((entry) => boundSearchString(entry, MAX_SEARCH_FACET_LENGTH));
  }
  if (typeof value === "string") {
    return value
      .split(",", MAX_SEARCH_FACETS + 1)
      .map((entry) => entry.trim().slice(0, MAX_SEARCH_FACET_LENGTH + 1));
  }
  return value;
}

function boundSearchPrimitive(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength + 1) : value;
}

/**
 * Drops provider-controlled unknown fields and bounds every retained value
 * before Zod/ranking can traverse it. One catalog never contributes more than
 * the configured per-attempt maximum.
 */
export function boundSearchCatalogPayload(value: unknown) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const rawMetas = record?.metas;
  if (!Array.isArray(rawMetas)) {
    return { payload: { metas: rawMetas }, truncated: false };
  }

  const metas = rawMetas
    .slice(0, MAX_RESULTS_PER_SEARCH_ATTEMPT)
    .map((rawMeta) => {
      if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
        return rawMeta;
      }
      const meta = rawMeta as Record<string, unknown>;
      return {
        id: boundSearchString(meta.id, MAX_SEARCH_ID_LENGTH),
        type: boundSearchString(meta.type, 16),
        name: boundSearchString(meta.name, MAX_SEARCH_NAME_LENGTH),
        poster: boundSearchString(meta.poster, MAX_SEARCH_URL_LENGTH),
        description: boundSearchString(
          meta.description,
          MAX_SEARCH_DESCRIPTION_LENGTH,
        ),
        releaseInfo: boundSearchPrimitive(
          meta.releaseInfo,
          MAX_SEARCH_SHORT_TEXT_LENGTH,
        ),
        released: boundSearchString(
          meta.released,
          MAX_SEARCH_SHORT_TEXT_LENGTH,
        ),
        imdbRating: boundSearchPrimitive(
          meta.imdbRating,
          MAX_SEARCH_SHORT_TEXT_LENGTH,
        ),
        aliases: boundSearchStringList(meta.aliases),
        alternativeTitles: boundSearchStringList(meta.alternativeTitles),
        genres: boundSearchFacetList(meta.genres),
        originalLanguage: boundSearchString(
          meta.originalLanguage ?? meta.original_language ?? meta.language,
          MAX_SEARCH_FACET_LENGTH,
        ),
      };
    });

  return {
    payload: { metas },
    truncated: rawMetas.length > MAX_RESULTS_PER_SEARCH_ATTEMPT,
  };
}

export interface SearchRequestOptions {
  type?: SearchContentType;
  mode?: SearchMode;
  limit?: number;
  cursor?: number | string;
  signal?: AbortSignal;
}

export type CachedSearchResponse = Omit<SearchResponse, "nextCursor">;
export type CachedSearchEntry = {
  expiresAt: number;
  origin: SearchMode;
  value: CachedSearchResponse;
  sizeBytes: number;
};

export type InFlightSearchEntry = {
  mode: SearchMode;
  controller: AbortController;
  promise: Promise<CachedSearchResponse>;
  waiters: number;
  settled: boolean;
};

export type SearchSnapshotEntry = {
  id: string;
  scopeKey: string;
  expiresAt: number;
  value: CachedSearchResponse;
  sizeBytes: number;
};

type DecodedSearchCursor = {
  snapshotId: string;
  offset: number;
};

export class InvalidSearchCursorError extends Error {
  constructor() {
    super("Invalid search cursor.");
    this.name = "InvalidSearchCursorError";
  }
}

export function searchResponseSizeBytes(value: CachedSearchResponse) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function isCompleteSearchResult(value: CachedSearchResponse) {
  return (
    !value.partial && !value.truncated && value.failedProviderIds.length === 0
  );
}

export function encodeSearchCursor(snapshotId: string, offset: number) {
  return Buffer.from(`1:${snapshotId}:${offset}`, "utf8").toString("base64url");
}

export function decodeSearchCursor(value: string): DecodedSearchCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw new InvalidSearchCursorError();
  }
  const match = decoded.match(/^1:([0-9a-f-]{36}):(\d{1,6})$/i);
  if (!match) throw new InvalidSearchCursorError();
  const offset = Number(match[2]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new InvalidSearchCursorError();
  }
  return { snapshotId: match[1], offset };
}

export function emptySearchResponse(): CachedSearchResponse {
  return {
    metas: [],
    providers: [],
    providersByContent: {},
    attemptedProviders: 0,
    successfulProviders: 0,
    failedProviderIds: [],
    partial: false,
    truncated: false,
    total: 0,
  };
}
