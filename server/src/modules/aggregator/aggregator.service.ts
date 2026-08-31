import https from "https";
import { randomUUID } from "crypto";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import {
  NonRetryableUpstreamError,
  resilienceRegistry,
  type ResilienceMetrics,
} from "./resilience.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { realDebridService } from "../debrid/real-debrid.service.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import { AppError } from "../../middleware/error.middleware.js";
import {
  fetchSafeAddonJson,
  fetchSafeAddonText,
  safeUrlForLog,
} from "../addon/addon-fetcher.js";
import {
  catalogResponseSchema,
  metaPreviewSchema,
  metaResponseSchema,
  MAX_SUBTITLE_CANDIDATES,
  streamResponseSchema,
  type AddonManifest,
  type MetaPreview,
  type MetaDetail,
  type Stream,
  type SearchResponse,
  type SubtitleCandidate,
  requiresAddonConfiguration,
  supportsCatalogType,
  SECURITY_LIMITS,
} from "@streamer/shared";
import { z } from "zod";
import { StreamParser } from "./domain/stream-parser.js";
import {
  getSearchableCatalogs,
  normalizeSearchText,
  rankSearchCandidates,
  SearchOutboundBudget,
  type SearchCandidate,
  type SearchContentType,
  type SearchMode,
} from "./search.js";

// Per-addon policy registry is now handled by resilienceRegistry

export class MetadataProvidersUnavailableError extends Error {
  constructor() {
    super("No metadata provider completed successfully.");
    this.name = "MetadataProvidersUnavailableError";
  }
}

function getUpstreamStatus(error: unknown): number | undefined {
  let candidate: unknown = error;

  // Resilience/transport libraries can retain the original failure as a
  // cause. Keep this deliberately shallow and never expose the cause to the
  // client.
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== "object") return undefined;
    const current = candidate as {
      status?: unknown;
      response?: { status?: unknown };
      cause?: unknown;
    };
    const status = current.response?.status ?? current.status;
    if (typeof status === "number") return status;
    candidate = current.cause;
  }

  return undefined;
}

function isExplicitMetadataNotFound(error: unknown) {
  return getUpstreamStatus(error) === 404;
}

const secureAgent = new https.Agent({
  maxSockets: 50,
  keepAlive: true,
});

export function buildCatalogPath(
  type: string,
  catalogId: string,
  search?: string,
  skip?: number,
): string {
  const extras: string[] = [];
  if (search) extras.push(`search=${encodeURIComponent(search)}`);
  if (skip && skip > 0) extras.push(`skip=${skip}`);

  const extraPath = extras.length > 0 ? `/${extras.join("&")}` : "";
  return `catalog/${type}/${catalogId}${extraPath}.json`;
}

/**
 * Resilience state must be scoped to the installed add-on, not to the
 * provider-controlled manifest id. Hashing the tenant, row id and origin keeps
 * metrics opaque while preventing one installation from poisoning another.
 */
export function buildAddonPolicyKey(
  userId: string,
  installedAddonId: string,
  transportUrl: string,
): string {
  let origin = transportUrl;
  try {
    origin = new URL(transportUrl).origin;
  } catch {
    // Installed transports are URL-validated. Keep a deterministic fallback
    // for old/corrupt rows so the policy key still remains tenant-scoped.
  }
  const input = `${userId}\u0000${installedAddonId}\u0000${origin}`;
  const bytes = new TextEncoder().encode(input);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `addon:${installedAddonId}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Resilient fetch wrapper for add-on requests with strict Zod validation */
async function resilientFetch<T>(
  transportUrl: string,
  addonPolicyKey: string,
  resourcePath: string,
  requestId: string,
  schema: z.ZodSchema<T>,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    callerSignal?: AbortSignal;
    nonRetryableClientErrors?: boolean;
    maxResponseBytes?: number;
    preparePayload?: (value: unknown) => unknown;
  } = {},
): Promise<T> {
  const policy = resilienceRegistry.getPolicy(addonPolicyKey);

  const base = transportUrl
    .replace(/\/manifest\.json\/?$/, "")
    .replace(/\/$/, "");
  const url = `${base}/${resourcePath}`;

  const start = Date.now();

  try {
    const result = await policy.execute(async () => {
      logger.debug(
        { requestId, addonPolicyKey, target: safeUrlForLog(url) },
        "Fetching from add-on",
      );

      let data: unknown;
      try {
        data = await fetchSafeAddonJson(url, {
          kind: "resource",
          timeoutMs: options.timeoutMs,
          maxResponseBytes: options.maxResponseBytes,
          signal: options.signal,
          axiosOptions: { httpsAgent: secureAgent },
        });
      } catch (error) {
        // A caller navigating away is not evidence that the provider failed.
        // Mark it non-retryable before resilience policies observe it so a
        // superseded query cannot open the provider circuit.
        if (options.callerSignal?.aborted) {
          throw new NonRetryableUpstreamError(
            "Search request cancelled.",
            error,
          );
        }
        const upstreamStatus = getUpstreamStatus(error);
        if (
          options.nonRetryableClientErrors &&
          upstreamStatus !== undefined &&
          upstreamStatus >= 400 &&
          upstreamStatus < 500
        ) {
          throw new NonRetryableUpstreamError(
            "Search request was rejected upstream.",
            error,
          );
        }
        // A missing title is a valid metadata lookup outcome, not a provider
        // outage. Mark it before the retry/breaker policies observe it while
        // retaining the original status for getMeta's final classification.
        if (
          resourcePath.startsWith("meta/") &&
          isExplicitMetadataNotFound(error)
        ) {
          throw new NonRetryableUpstreamError(
            "Metadata not found upstream.",
            error,
          );
        }
        throw error;
      }

      // Strict Sanitation: Search can additionally discard unknown/heavy
      // fields and bound collections before Zod walks every retained item.
      const prepared = options.preparePayload
        ? options.preparePayload(data)
        : data;
      const parsed = schema.safeParse(prepared);
      if (!parsed.success) {
        logger.error(
          { requestId, addonPolicyKey, errors: parsed.error.format() },
          "Add-on response failed validation",
        );
        throw new Error("Invalid response format from add-on");
      }

      return parsed.data;
    }, options.signal);

    logger.info(
      { requestId, addonPolicyKey, latencyMs: Date.now() - start },
      "Add-on fetch success",
    );

    return result;
  } catch (err: any) {
    logger.warn(
      {
        requestId,
        addonPolicyKey,
        latencyMs: Date.now() - start,
        target: safeUrlForLog(url),
        error: err.message,
      },
      "Add-on fetch failed",
    );
    throw err;
  }
}

const SEARCH_CACHE_TTL_MS = 15_000;
const DEGRADED_SEARCH_CACHE_TTL_MS = 2_000;
const SUGGESTION_TIMEOUT_MS = 1_800;
const RESULT_TIMEOUT_MS = 4_500;
const SUGGESTION_LIMIT = 6;
const RESULT_LIMIT = 40;
const SEARCH_CACHE_MAX_ENTRIES = 250;
const SEARCH_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const SEARCH_CACHE_MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const SEARCH_SNAPSHOT_TTL_MS = 5 * 60_000;
const SEARCH_SNAPSHOT_MAX_ENTRIES = 100;
const SEARCH_SNAPSHOT_MAX_BYTES = 24 * 1024 * 1024;
const MAX_SEARCH_ADDON_SCAN = 64;
const MAX_SEARCH_PROVIDERS = 16;
const MAX_SEARCH_CATALOGS_PER_ADDON = 4;
const MAX_SEARCH_ATTEMPTS = 32;
const MAX_RESULTS_PER_SEARCH_ATTEMPT = 200;
const MAX_SEARCH_CANDIDATES = 2_000;
const MAX_SEARCH_CANDIDATE_BYTES = 4 * 1024 * 1024;
const MAX_SEARCH_RESPONSE_BYTES = 512 * 1024;
const MAX_SEARCH_ID_LENGTH = 512;
const MAX_SEARCH_NAME_LENGTH = 512;
const MAX_SEARCH_URL_LENGTH = 4_096;
const MAX_SEARCH_DESCRIPTION_LENGTH = 8_192;
const MAX_SEARCH_SHORT_TEXT_LENGTH = 128;
const MAX_SEARCH_TITLE_ALIASES = 32;
const MAX_SEARCH_ALIAS_LENGTH = 512;
const MAX_SEARCH_PROVIDER_NAME_LENGTH = 256;
const MAX_SEARCH_FACETS = 16;
const MAX_SEARCH_FACET_LENGTH = 64;
const MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS = 64;
const GLOBAL_SEARCH_MAX_CONCURRENT = 8;
const GLOBAL_SEARCH_MAX_QUEUED = 64;
const MAX_SUBTITLE_PROVIDERS = 16;
const MAX_SUBTITLES_PER_PROVIDER = 200;
const SUBTITLE_CATALOG_TIMEOUT_MS = 5_000;
const SUBTITLE_DOCUMENT_TIMEOUT_MS = 10_000;
const SUBTITLE_DOCUMENT_CACHE_TTL_MS = 10 * 60_000;
const SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES = MAX_SUBTITLE_CANDIDATES;
const SUBTITLE_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
const STREAM_DISCOVERY_CACHE_TTL_MS = 30_000;
const STREAM_DISCOVERY_CACHE_MAX_ENTRIES = 100;
const STREAM_DISCOVERY_FAST_WINDOW_MS = 250;
const STREAM_DISCOVERY_FAST_DEADLINE_MS = 1_750;
const REAL_DEBRID_RESOLUTION_WINDOW_MS = 60_000;
const INFO_HASH_PATTERN = /^[a-z0-9]{1,128}$/i;

const searchOutboundBudget = new SearchOutboundBudget(
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

const strictSearchCatalogResponseSchema = z.object({
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

type CachedSearchResponse = Omit<SearchResponse, "nextCursor">;
type CachedSearchEntry = {
  expiresAt: number;
  origin: SearchMode;
  value: CachedSearchResponse;
  sizeBytes: number;
};

type InFlightSearchEntry = {
  mode: SearchMode;
  controller: AbortController;
  promise: Promise<CachedSearchResponse>;
  waiters: number;
  settled: boolean;
};

type SearchSnapshotEntry = {
  id: string;
  scopeKey: string;
  expiresAt: number;
  value: CachedSearchResponse;
  sizeBytes: number;
};

export type StreamDiscoveryStatus = "partial" | "complete";

/**
 * Internal, memory-only stream lookup result shared by the stream route and
 * the playback planner. The nested streams are runtime-only and are never
 * persisted or included in timing logs.
 */
export interface StreamDiscoveryResult {
  streams: Stream[];
  status: StreamDiscoveryStatus;
}

export interface StreamDiscoveryRequestOptions {
  /** Stops provider work only while no caller has received a fast result. */
  signal?: AbortSignal;
  /** Wait for every provider so the result can authorize a source. */
  requireComplete?: boolean;
}

type CachedStreamDiscoveryEntry = {
  expiresAt: number;
  value: StreamDiscoveryResult;
};

type InFlightStreamDiscoveryEntry = {
  controller: AbortController;
  fastPromise: Promise<StreamDiscoveryResult>;
  completePromise: Promise<StreamDiscoveryResult>;
  resolveFast: (value: StreamDiscoveryResult) => void;
  rejectFast: (reason?: unknown) => void;
  resolveComplete: (value: StreamDiscoveryResult) => void;
  rejectComplete: (reason?: unknown) => void;
  waiters: number;
  fastSettled: boolean;
  settled: boolean;
  invalidated: boolean;
  cancelledBeforeFastResult: boolean;
};

type SubtitleDocumentCacheEntry = {
  userId: string;
  url: string;
  expiresAt: number;
};

type UncachedSubtitleCandidate = {
  candidate: Omit<SubtitleCandidate, "fetchIdentity">;
  documentUrl: string;
};

const addonSubtitleResponseSchema = z
  .object({
    subtitles: z
      .array(
        z
          .object({
            id: z.string().max(512).optional(),
            url: z.string().min(1).max(4_096),
            lang: z.string().max(32).optional(),
            language: z.string().max(32).optional(),
            title: z.string().max(512).optional(),
            name: z.string().max(512).optional(),
          })
          .strip(),
      )
      .max(MAX_SUBTITLES_PER_PROVIDER),
  })
  .strip();

function normalizeSubtitleLanguage(value: unknown) {
  const primary =
    typeof value === "string"
      ? value.trim().toLowerCase().split(/[-_]/)[0]
      : "";
  const aliases: Record<string, string> = {
    eng: "en",
    nld: "nl",
    dut: "nl",
    spa: "es",
    esp: "es",
    deu: "de",
    ger: "de",
    fra: "fr",
    fre: "fr",
    ita: "it",
    por: "pt",
  };
  return aliases[primary] || primary || "unknown";
}

function subtitleFormatFromUrl(url: string): SubtitleCandidate["format"] {
  try {
    const extension = new URL(url).pathname
      .toLowerCase()
      .match(/\.(srt|vtt|ass|ssa)$/)?.[1];
    return extension === "srt" ||
      extension === "vtt" ||
      extension === "ass" ||
      extension === "ssa"
      ? extension
      : ("unknown" as const);
  } catch {
    return "unknown" as const;
  }
}

function normalizeHttpSubtitleUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function deduplicateAndBoundSubtitleCandidates(
  batches: Array<UncachedSubtitleCandidate[] | undefined>,
) {
  const candidates: UncachedSubtitleCandidate[] = [];
  const candidateIds = new Set<string>();
  const documentUrls = new Set<string>();

  // Promise.allSettled preserves provider order. Keeping the first occurrence
  // therefore makes duplicate selection deterministic without exposing or
  // ranking by the provider-controlled document URL.
  for (const batch of batches) {
    for (const entry of batch ?? []) {
      if (
        candidateIds.has(entry.candidate.id) ||
        documentUrls.has(entry.documentUrl)
      ) {
        continue;
      }
      candidateIds.add(entry.candidate.id);
      documentUrls.add(entry.documentUrl);
      candidates.push(entry);
      if (candidates.length >= MAX_SUBTITLE_CANDIDATES) {
        return candidates;
      }
    }
  }

  return candidates;
}

function isPlayableStreamResult(stream: Stream) {
  return Boolean(stream.url || stream.infoHash);
}

function normalizeInfoHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return INFO_HASH_PATTERN.test(normalized) ? normalized : null;
}

function isResolutionSecurityError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "SOURCE_NOT_AUTHORIZED" || code === "REAL_DEBRID_QUOTA";
}

function sortAndEnrichStreams(
  batches: Array<Stream[] | undefined>,
  type: string,
  id: string,
): Stream[] {
  return batches
    .flatMap((batch) => batch ?? [])
    .map((stream, index) => ({
      stream: StreamParser.enrich({ ...stream, type, id }),
      index,
    }))
    .sort((a, b) => {
      const comparison = StreamParser.compare(a.stream, b.stream);
      return comparison === 0 ? a.index - b.index : comparison;
    })
    .map(({ stream }) => stream);
}

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

function searchResponseSizeBytes(value: CachedSearchResponse) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function isCompleteSearchResult(value: CachedSearchResponse) {
  return (
    !value.partial && !value.truncated && value.failedProviderIds.length === 0
  );
}

function encodeSearchCursor(snapshotId: string, offset: number) {
  return Buffer.from(`1:${snapshotId}:${offset}`, "utf8").toString("base64url");
}

function decodeSearchCursor(value: string): DecodedSearchCursor {
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

function emptySearchResponse(): CachedSearchResponse {
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

async function runSearchAttempt<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
      settle();
    };
    const abortFromParent = () => {
      controller.abort(parentSignal?.reason);
      finish(() =>
        reject(parentSignal?.reason ?? new Error("Search request cancelled.")),
      );
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error("Search provider timed out.")));
    }, timeoutMs);

    if (parentSignal?.aborted) {
      abortFromParent();
      return;
    }
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });

    run(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export class AggregatorService {
  private readonly searchCache = new Map<string, CachedSearchEntry>();
  private searchCacheBytes = 0;
  private readonly searchInFlight = new Map<string, InFlightSearchEntry>();
  private readonly searchSnapshots = new Map<string, SearchSnapshotEntry>();
  private readonly searchSnapshotByScope = new Map<string, string>();
  private searchSnapshotBytes = 0;
  private readonly streamDiscoveryCache = new Map<
    string,
    CachedStreamDiscoveryEntry
  >();
  private readonly streamDiscoveryInFlight = new Map<
    string,
    InFlightStreamDiscoveryEntry
  >();
  private readonly subtitleDocuments = new Map<
    string,
    SubtitleDocumentCacheEntry
  >();
  private readonly realDebridResolutionQuota = new Map<
    string,
    { windowStartedAt: number; count: number }
  >();

  private pruneSubtitleDocuments() {
    const now = Date.now();
    for (const [identity, entry] of this.subtitleDocuments) {
      if (entry.expiresAt <= now) this.subtitleDocuments.delete(identity);
    }
    while (this.subtitleDocuments.size > SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES) {
      const oldest = this.subtitleDocuments.keys().next().value;
      if (oldest === undefined) break;
      this.subtitleDocuments.delete(oldest);
    }
  }

  private cacheSubtitleDocument(userId: string, url: string) {
    this.pruneSubtitleDocuments();
    while (this.subtitleDocuments.size >= SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES) {
      const oldest = this.subtitleDocuments.keys().next().value;
      if (oldest === undefined) break;
      this.subtitleDocuments.delete(oldest);
    }
    const fetchIdentity = randomUUID();
    this.subtitleDocuments.set(fetchIdentity, {
      userId,
      url,
      expiresAt: Date.now() + SUBTITLE_DOCUMENT_CACHE_TTL_MS,
    });
    return fetchIdentity;
  }

  async getSubtitleCandidates(
    userId: string,
    type: string,
    id: string,
    requestId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<SubtitleCandidate[]> {
    const addons = await this.getUserAddons(userId);
    const providers = addons
      .filter((addon) =>
        this.addonSupportsResource(addon.manifest, "subtitles", type),
      )
      .slice(0, MAX_SUBTITLE_PROVIDERS);

    const batches = await Promise.allSettled(
      providers.map(async (addon) => {
        const response = await resilientFetch(
          addon.transportUrl,
          buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
          `subtitles/${type}/${encodeURIComponent(id)}.json`,
          requestId,
          addonSubtitleResponseSchema,
          {
            timeoutMs: SUBTITLE_CATALOG_TIMEOUT_MS,
            maxResponseBytes: 512 * 1024,
            signal: options.signal,
            callerSignal: options.signal,
          },
        );

        return response.subtitles.flatMap((subtitle, index) => {
          const documentUrl = normalizeHttpSubtitleUrl(subtitle.url);
          if (!documentUrl) return [];
          const label =
            subtitle.title ||
            subtitle.name ||
            `${normalizeSubtitleLanguage(
              subtitle.lang || subtitle.language,
            ).toUpperCase()} · ${addon.manifest.name}`;
          const evidence = `${subtitle.id || ""} ${label}`;

          return [
            {
              candidate: {
                id: `addon:${addon.id}:${subtitle.id || index}`,
                providerId: addon.id,
                providerName: addon.manifest.name,
                language: normalizeSubtitleLanguage(
                  subtitle.lang || subtitle.language,
                ),
                format: subtitleFormatFromUrl(documentUrl),
                source: "addon" as const,
                label,
                hearingImpaired:
                  /\b(?:sdh|hearing impaired|closed captions?|\bcc\b)\b/i.test(
                    evidence,
                  ),
                forced: /\bforced\b/i.test(evidence),
                fileHashMatch: false,
                fileNameMatch: false,
                contentIdMatch: true,
                confidence: 0.9,
                active: false,
              },
              documentUrl,
            },
          ];
        });
      }),
    );

    return deduplicateAndBoundSubtitleCandidates(
      batches.map((batch) =>
        batch.status === "fulfilled" ? batch.value : undefined,
      ),
    ).map(({ candidate, documentUrl }) => ({
      ...candidate,
      fetchIdentity: this.cacheSubtitleDocument(userId, documentUrl),
    }));
  }

  async getSubtitleDocument(
    userId: string,
    fetchIdentity: string,
    signal?: AbortSignal,
  ) {
    this.pruneSubtitleDocuments();
    const entry = this.subtitleDocuments.get(fetchIdentity);
    if (!entry || entry.userId !== userId) return null;

    return fetchSafeAddonText(entry.url, {
      timeoutMs: SUBTITLE_DOCUMENT_TIMEOUT_MS,
      maxResponseBytes: SUBTITLE_DOCUMENT_MAX_BYTES,
      signal,
      axiosOptions: { httpsAgent: secureAgent },
    });
  }

  private streamDiscoveryKey(userId: string, type: string, id: string) {
    return `${userId}\u0000${type}\u0000${id}`;
  }

  private deleteStreamDiscoveryCacheEntry(key: string) {
    this.streamDiscoveryCache.delete(key);
  }

  private getStreamDiscoveryCacheEntry(key: string) {
    const entry = this.streamDiscoveryCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.deleteStreamDiscoveryCacheEntry(key);
      return undefined;
    }

    // Keep the bounded Map in least-recently-used order.
    this.streamDiscoveryCache.delete(key);
    this.streamDiscoveryCache.set(key, entry);
    return entry.value;
  }

  private storeStreamDiscoveryCache(key: string, value: StreamDiscoveryResult) {
    for (const [cachedKey, cached] of this.streamDiscoveryCache) {
      if (cached.expiresAt <= Date.now()) {
        this.deleteStreamDiscoveryCacheEntry(cachedKey);
      }
    }

    this.deleteStreamDiscoveryCacheEntry(key);
    while (
      this.streamDiscoveryCache.size >= STREAM_DISCOVERY_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = this.streamDiscoveryCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.deleteStreamDiscoveryCacheEntry(oldestKey);
    }

    this.streamDiscoveryCache.set(key, {
      expiresAt: Date.now() + STREAM_DISCOVERY_CACHE_TTL_MS,
      value,
    });
  }

  private getOrStartStreamDiscoveryRun(
    key: string,
    userId: string,
    type: string,
    id: string,
    requestId: string,
  ) {
    const current = this.streamDiscoveryInFlight.get(key);
    if (current && !current.settled && !current.controller.signal.aborted) {
      return current;
    }

    const controller = new AbortController();
    let resolveFast!: (value: StreamDiscoveryResult) => void;
    let rejectFast!: (reason?: unknown) => void;
    const fastPromise = new Promise<StreamDiscoveryResult>(
      (resolve, reject) => {
        resolveFast = resolve;
        rejectFast = reject;
      },
    );
    let resolveComplete!: (value: StreamDiscoveryResult) => void;
    let rejectComplete!: (reason?: unknown) => void;
    const completePromise = new Promise<StreamDiscoveryResult>(
      (resolve, reject) => {
        resolveComplete = resolve;
        rejectComplete = reject;
      },
    );
    // A caller may cancel before the run finishes. Keep the background
    // single-flight from producing an unhandled rejection in that case.
    void fastPromise.catch(() => undefined);
    void completePromise.catch(() => undefined);

    const entry: InFlightStreamDiscoveryEntry = {
      controller,
      fastPromise,
      completePromise,
      resolveFast,
      rejectFast,
      resolveComplete,
      rejectComplete,
      waiters: 0,
      fastSettled: false,
      settled: false,
      invalidated: false,
      cancelledBeforeFastResult: false,
    };
    this.streamDiscoveryInFlight.set(key, entry);
    void this.runStreamDiscovery(key, userId, type, id, requestId, entry);
    return entry;
  }

  private waitForStreamDiscoveryRun(
    entry: InFlightStreamDiscoveryEntry,
    callerSignal?: AbortSignal,
    promise: Promise<StreamDiscoveryResult> = entry.fastPromise,
  ): Promise<StreamDiscoveryResult> {
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle: () => void) => {
        if (finished) return;
        finished = true;
        callerSignal?.removeEventListener("abort", abortForCaller);
        entry.waiters = Math.max(0, entry.waiters - 1);

        // Before a fast response, a route cancellation should stop the
        // outbound work rather than leave an abandoned fan-out running. Once a
        // partial result was returned, the background run intentionally keeps
        // going for the short-lived cache.
        if (
          entry.waiters === 0 &&
          !entry.fastSettled &&
          !entry.settled &&
          !entry.controller.signal.aborted
        ) {
          entry.cancelledBeforeFastResult = true;
          entry.controller.abort(new Error("Stream discovery cancelled."));
        }
        settle();
      };
      const abortForCaller = () =>
        finish(() =>
          reject(
            callerSignal?.reason ?? new Error("Stream discovery cancelled."),
          ),
        );

      if (callerSignal?.aborted) {
        abortForCaller();
        return;
      }

      callerSignal?.addEventListener("abort", abortForCaller, { once: true });
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private async runStreamDiscovery(
    key: string,
    userId: string,
    type: string,
    id: string,
    requestId: string,
    entry: InFlightStreamDiscoveryEntry,
  ) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + STREAM_DISCOVERY_FAST_DEADLINE_MS;
    let providersTotal = 0;
    let providersCompleted = 0;
    let batches: Array<Stream[] | undefined> = [];
    let fastWindowTimer: ReturnType<typeof setTimeout> | undefined;
    let fastDeadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (fastWindowTimer) clearTimeout(fastWindowTimer);
      if (fastDeadlineTimer) clearTimeout(fastDeadlineTimer);
      fastWindowTimer = undefined;
      fastDeadlineTimer = undefined;
    };
    const collectedStreams = () => sortAndEnrichStreams(batches, type, id);
    const timingFields = (
      result: StreamDiscoveryResult,
      cache: "hit" | "miss",
    ) => ({
      requestId,
      cache,
      status: result.status,
      latencyMs: Date.now() - startedAt,
      usableStreamCount: result.streams.filter(isPlayableStreamResult).length,
      providerResponses: providersCompleted,
      providerCount: providersTotal,
    });
    const settleFast = (status: StreamDiscoveryStatus) => {
      if (entry.fastSettled) return;
      const result: StreamDiscoveryResult = {
        streams: collectedStreams(),
        status,
      };
      if (
        status === "partial" &&
        !result.streams.some(isPlayableStreamResult)
      ) {
        return;
      }

      entry.fastSettled = true;
      if (fastWindowTimer) clearTimeout(fastWindowTimer);
      fastWindowTimer = undefined;
      if (status === "partial" && fastDeadlineTimer) {
        clearTimeout(fastDeadlineTimer);
        fastDeadlineTimer = undefined;
      }
      logger.info(timingFields(result, "miss"), "Stream discovery timing");
      entry.resolveFast(result);
    };
    const settleComplete = () => {
      if (entry.settled) return;
      clearTimers();
      const alreadyReturnedFastResult = entry.fastSettled;
      const result: StreamDiscoveryResult = {
        streams: collectedStreams(),
        status: "complete",
      };
      if (!entry.fastSettled) settleFast("complete");
      if (!entry.invalidated && !entry.cancelledBeforeFastResult) {
        this.storeStreamDiscoveryCache(key, result);
      }
      entry.resolveComplete(result);
      entry.settled = true;
      if (this.streamDiscoveryInFlight.get(key) === entry) {
        this.streamDiscoveryInFlight.delete(key);
      }

      // A partial answer has already been returned, so this is the timing of
      // the cache warm-up rather than another source response.
      if (alreadyReturnedFastResult) {
        logger.info(
          timingFields(result, "miss"),
          "Stream discovery cache warmed",
        );
      }
    };
    const fail = (error: unknown) => {
      if (entry.settled) return;
      clearTimers();
      entry.settled = true;
      if (!entry.fastSettled) {
        entry.fastSettled = true;
        entry.rejectFast(error);
      }
      entry.rejectComplete(error);
      if (this.streamDiscoveryInFlight.get(key) === entry) {
        this.streamDiscoveryInFlight.delete(key);
      }
    };
    const scheduleFastResult = () => {
      if (entry.fastSettled || fastWindowTimer) return;

      // The deadline prevents a long wait for a *first* source; it must not
      // turn a viable response that arrives shortly afterward into a wait for
      // every remaining slow provider. Once we have a usable batch, release
      // it immediately and let the same run finish warming the cache.
      if (Date.now() >= deadlineAt) {
        settleFast("partial");
        return;
      }
      const remainingMs = Math.max(0, deadlineAt - Date.now());
      fastWindowTimer = setTimeout(
        () => settleFast("partial"),
        Math.min(STREAM_DISCOVERY_FAST_WINDOW_MS, remainingMs),
      );
    };

    try {
      const addons = await this.getUserAddons(userId);
      if (entry.controller.signal.aborted) {
        fail(
          entry.controller.signal.reason ??
            new Error("Stream discovery cancelled."),
        );
        return;
      }

      const providers = addons.filter((addon: any) =>
        this.addonSupportsResource(addon.manifest, "stream", type),
      );
      providersTotal = providers.length;
      batches = new Array(providers.length);

      if (providers.length === 0) {
        settleComplete();
        return;
      }

      fastDeadlineTimer = setTimeout(
        () => {
          settleFast("partial");
        },
        Math.max(0, deadlineAt - Date.now()),
      );

      await Promise.allSettled(
        providers.map(async (addon: any, index: number) => {
          try {
            const data = await resilientFetch(
              addon.transportUrl,
              buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
              `stream/${type}/${id}.json`,
              requestId,
              streamResponseSchema,
              {
                signal: entry.controller.signal,
                callerSignal: entry.controller.signal,
              },
            );
            batches[index] = data.streams || [];
            if (batches[index]!.some(isPlayableStreamResult)) {
              scheduleFastResult();
            }
          } finally {
            providersCompleted += 1;
          }
        }),
      );

      if (entry.controller.signal.aborted) {
        fail(
          entry.controller.signal.reason ??
            new Error("Stream discovery cancelled."),
        );
        return;
      }
      settleComplete();
    } catch (error) {
      fail(error);
    }
  }

  /**
   * Returns a user-scoped, memory-only stream lookup. The first caller starts
   * the provider fan-out; callers that arrive while it runs receive the same
   * fast result, while late provider responses warm the 30-second cache.
   */
  async getStreamDiscovery(
    userId: string,
    type: string,
    id: string,
    requestId: string,
    options: StreamDiscoveryRequestOptions = {},
  ): Promise<StreamDiscoveryResult> {
    const key = this.streamDiscoveryKey(userId, type, id);
    const cached = this.getStreamDiscoveryCacheEntry(key);
    if (cached) {
      logger.info(
        {
          requestId,
          cache: "hit",
          status: cached.status,
          latencyMs: 0,
          usableStreamCount: cached.streams.filter(isPlayableStreamResult)
            .length,
        },
        "Stream discovery timing",
      );
      return cached;
    }

    const entry = this.getOrStartStreamDiscoveryRun(
      key,
      userId,
      type,
      id,
      requestId,
    );
    return this.waitForStreamDiscoveryRun(
      entry,
      options.signal,
      options.requireComplete ? entry.completePromise : entry.fastPromise,
    );
  }

  invalidateStreamDiscoveryCacheForUser(userId: string) {
    const prefix = `${userId}\u0000`;
    for (const key of this.streamDiscoveryCache.keys()) {
      if (key.startsWith(prefix)) this.deleteStreamDiscoveryCacheEntry(key);
    }
    for (const [key, entry] of this.streamDiscoveryInFlight) {
      if (!key.startsWith(prefix)) continue;
      entry.invalidated = true;
      entry.controller.abort(new Error("Installed add-ons changed."));
      this.streamDiscoveryInFlight.delete(key);
    }
  }

  private deleteSearchCacheEntry(key: string) {
    const existing = this.searchCache.get(key);
    if (!existing) return;
    this.searchCache.delete(key);
    this.searchCacheBytes = Math.max(
      0,
      this.searchCacheBytes - existing.sizeBytes,
    );
  }

  private storeSearchCache(
    key: string,
    origin: SearchMode,
    value: CachedSearchResponse,
  ) {
    const sizeBytes = searchResponseSizeBytes(value);
    const current = this.searchCache.get(key);
    // A short-budget suggestion run finishing later must not replace a fresh
    // full-result cache entry produced concurrently for the same query.
    if (
      origin === "suggestions" &&
      current?.origin === "results" &&
      current.expiresAt > Date.now()
    ) {
      return;
    }
    this.deleteSearchCacheEntry(key);
    for (const [cachedKey, cached] of this.searchCache) {
      if (cached.expiresAt <= Date.now()) {
        this.deleteSearchCacheEntry(cachedKey);
      }
    }
    if (sizeBytes > SEARCH_CACHE_MAX_ENTRY_BYTES) return;
    while (
      this.searchCache.size >= SEARCH_CACHE_MAX_ENTRIES ||
      this.searchCacheBytes + sizeBytes > SEARCH_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.deleteSearchCacheEntry(oldestKey);
    }
    const degraded =
      value.partial || value.truncated || value.failedProviderIds.length > 0;
    const expiresAt =
      Date.now() +
      (degraded || value.attemptedProviders === 0
        ? DEGRADED_SEARCH_CACHE_TTL_MS
        : SEARCH_CACHE_TTL_MS);
    this.searchCache.set(key, {
      expiresAt,
      origin,
      value,
      sizeBytes,
    });
    this.searchCacheBytes += sizeBytes;
  }

  private deleteSearchSnapshot(id: string) {
    const snapshot = this.searchSnapshots.get(id);
    if (!snapshot) return;
    this.searchSnapshots.delete(id);
    this.searchSnapshotBytes = Math.max(
      0,
      this.searchSnapshotBytes - snapshot.sizeBytes,
    );
    if (this.searchSnapshotByScope.get(snapshot.scopeKey) === id) {
      this.searchSnapshotByScope.delete(snapshot.scopeKey);
    }
  }

  private getSearchSnapshot(id: string, scopeKey: string) {
    const snapshot = this.searchSnapshots.get(id);
    if (!snapshot) return undefined;
    if (snapshot.expiresAt <= Date.now()) {
      this.deleteSearchSnapshot(id);
      return undefined;
    }
    return snapshot.scopeKey === scopeKey ? snapshot : undefined;
  }

  private storeSearchSnapshot(
    scopeKey: string,
    value: CachedSearchResponse,
  ): string | undefined {
    for (const [id, snapshot] of this.searchSnapshots) {
      if (snapshot.expiresAt <= Date.now()) this.deleteSearchSnapshot(id);
    }

    const currentId = this.searchSnapshotByScope.get(scopeKey);
    if (currentId) {
      const current = this.getSearchSnapshot(currentId, scopeKey);
      if (current?.value === value) return current.id;
    }

    const sizeBytes = searchResponseSizeBytes(value);
    if (sizeBytes > SEARCH_CACHE_MAX_ENTRY_BYTES) return undefined;
    while (
      this.searchSnapshots.size >= SEARCH_SNAPSHOT_MAX_ENTRIES ||
      this.searchSnapshotBytes + sizeBytes > SEARCH_SNAPSHOT_MAX_BYTES
    ) {
      const oldestId = this.searchSnapshots.keys().next().value;
      if (oldestId === undefined) break;
      this.deleteSearchSnapshot(oldestId);
    }

    const id = crypto.randomUUID();
    this.searchSnapshots.set(id, {
      id,
      scopeKey,
      expiresAt: Date.now() + SEARCH_SNAPSHOT_TTL_MS,
      value,
      sizeBytes,
    });
    this.searchSnapshotByScope.set(scopeKey, id);
    this.searchSnapshotBytes += sizeBytes;
    return id;
  }

  private getOrStartSearchRun(
    key: string,
    mode: SearchMode,
    run: (signal: AbortSignal) => Promise<CachedSearchResponse>,
  ) {
    // Suggestion and full-result work have different provider budgets. Never
    // let a suggestion caller inherit an existing 4.5s result run.
    const inFlightKey = `${key}\u0000${mode}`;
    const current = this.searchInFlight.get(inFlightKey);
    if (current && !current.settled && !current.controller.signal.aborted) {
      return current;
    }

    const controller = new AbortController();
    const entry: InFlightSearchEntry = {
      mode,
      controller,
      promise: Promise.resolve(emptySearchResponse()),
      waiters: 0,
      settled: false,
    };
    entry.promise = run(controller.signal);
    this.searchInFlight.set(inFlightKey, entry);
    const cleanup = () => {
      entry.settled = true;
      if (this.searchInFlight.get(inFlightKey) === entry) {
        this.searchInFlight.delete(inFlightKey);
      }
    };
    entry.promise.then(cleanup, cleanup);
    return entry;
  }

  private waitForSearchRun(
    entry: InFlightSearchEntry,
    callerSignal?: AbortSignal,
  ): Promise<CachedSearchResponse> {
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle: () => void) => {
        if (finished) return;
        finished = true;
        callerSignal?.removeEventListener("abort", abortForCaller);
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (entry.waiters === 0 && !entry.settled) {
          entry.controller.abort(new Error("Search request cancelled."));
        }
        settle();
      };
      const abortForCaller = () =>
        finish(() =>
          reject(
            callerSignal?.reason ?? new Error("Search request cancelled."),
          ),
        );

      if (callerSignal?.aborted) {
        abortForCaller();
        return;
      }
      callerSignal?.addEventListener("abort", abortForCaller, { once: true });
      entry.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  invalidateSearchCacheForUser(userId: string) {
    const prefix = `${userId}\u0000`;
    for (const key of this.searchCache.keys()) {
      if (key.startsWith(prefix)) this.deleteSearchCacheEntry(key);
    }
    for (const [id, snapshot] of this.searchSnapshots) {
      if (snapshot.scopeKey.startsWith(prefix)) this.deleteSearchSnapshot(id);
    }
    for (const [key, entry] of this.searchInFlight) {
      if (!key.startsWith(prefix)) continue;
      entry.controller.abort(new Error("Installed add-ons changed."));
      this.searchInFlight.delete(key);
    }
  }

  removeAddonStateForUser(
    userId: string,
    installedAddonId: string,
    transportUrl: string,
  ) {
    this.invalidateSearchCacheForUser(userId);
    this.invalidateStreamDiscoveryCacheForUser(userId);
    resilienceRegistry.remove(
      buildAddonPolicyKey(userId, installedAddonId, transportUrl),
    );
  }

  /**
   * Authenticated, user-scoped diagnostics. Internal policy keys, installation
   * ids and provider origins never cross the API boundary.
   */
  async getResilienceDiagnostics(userId: string) {
    const rows = await prisma.installedAddon.findMany({
      where: { userId },
      orderBy: { installedAt: "asc" },
      take: MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS + 1,
    });
    const totals: ResilienceMetrics = {
      timeouts: 0,
      retries: 0,
      circuitOpens: 0,
      bulkheadRejections: 0,
      lastFailure: null,
    };
    const providers = rows
      .slice(0, MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS)
      .map((row: any, index: number) => {
        const metrics = resilienceRegistry.peekMetrics(
          buildAddonPolicyKey(userId, row.id, row.transportUrl),
        ) ?? {
          timeouts: 0,
          retries: 0,
          circuitOpens: 0,
          bulkheadRejections: 0,
          lastFailure: null,
        };
        totals.timeouts += metrics.timeouts;
        totals.retries += metrics.retries;
        totals.circuitOpens += metrics.circuitOpens;
        totals.bulkheadRejections += metrics.bulkheadRejections;
        if (
          metrics.lastFailure &&
          (!totals.lastFailure || metrics.lastFailure > totals.lastFailure)
        ) {
          totals.lastFailure = metrics.lastFailure;
        }
        const manifest = row.manifest as { name?: unknown } | null;
        const rawName =
          typeof manifest?.name === "string" ? manifest.name.trim() : "";
        return {
          provider:
            rawName.slice(0, MAX_SEARCH_PROVIDER_NAME_LENGTH) ||
            `Provider ${index + 1}`,
          metrics: {
            ...metrics,
            lastFailure: metrics.lastFailure?.toISOString() ?? null,
          },
        };
      });

    return {
      providers,
      totals: {
        ...totals,
        lastFailure: totals.lastFailure?.toISOString() ?? null,
      },
      truncated: rows.length > MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS,
    };
  }

  /** Fetch catalogs from all installed add-ons and merge results */
  async getCatalog(
    userId: string,
    type: string,
    requestId: string,
    search?: string,
    skip?: number,
  ): Promise<MetaPreview[]> {
    const addons = await this.getUserAddons(userId);

    const results = await Promise.allSettled(
      addons
        .filter((a: any) =>
          this.addonSupportsResource(a.manifest, "catalog", type),
        )
        .map(async (addon: any) => {
          const catalogId = this.findCatalogId(addon.manifest, type);
          if (!catalogId) return [];

          const data = await resilientFetch(
            addon.transportUrl,
            buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
            buildCatalogPath(type, catalogId, search, skip),
            requestId,
            catalogResponseSchema,
          );
          return data.metas || [];
        }),
    );

    return results
      .filter(
        (r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
      )
      .flatMap((r: any) => r.value as MetaPreview[]);
  }

  /** Fetch one exact catalog from one installed add-on for Discover rows */
  async getAddonCatalog(
    userId: string,
    addonId: string,
    type: string,
    catalogId: string,
    requestId: string,
    search?: string,
    skip?: number,
  ): Promise<MetaPreview[]> {
    const addon = await this.getUserAddon(userId, addonId);
    if (!addon) {
      throw new Error("Add-on not installed");
    }

    if (!this.addonSupportsResource(addon.manifest, "catalog", type)) {
      throw new Error("Add-on does not support this catalog type");
    }

    const catalog = addon.manifest.catalogs.find(
      (c) => c.type === type && c.id === catalogId,
    );
    if (!catalog) {
      throw new Error("Catalog not found for add-on");
    }

    const data = await resilientFetch(
      addon.transportUrl,
      buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
      buildCatalogPath(type, catalogId, search, skip),
      requestId,
      catalogResponseSchema,
    );

    return data.metas || [];
  }

  /** Fetch metadata from add-ons that support this type/id */
  async getMeta(
    userId: string,
    type: string,
    id: string,
    requestId: string,
  ): Promise<MetaDetail | null> {
    const addons = await this.getUserAddons(userId);
    const metaProviders = addons.filter((addon: any) =>
      this.addonSupportsResource(addon.manifest, "meta", type),
    );

    if (metaProviders.length === 0) return null;

    const results = await Promise.allSettled(
      metaProviders.map(async (addon: any) => {
        const data = await resilientFetch(
          addon.transportUrl,
          buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
          `meta/${type}/${id}.json`,
          requestId,
          metaResponseSchema,
        );
        return data.meta;
      }),
    );

    // A valid result wins even when other providers fail or do not carry the
    // title. Partial upstream failure must not hide usable metadata.
    const fulfilled = results.find(
      (r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
    );
    if (fulfilled) return fulfilled.value as MetaDetail;

    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (
      failures.length > 0 &&
      failures.every((failure) => isExplicitMetadataNotFound(failure.reason))
    ) {
      return null;
    }

    // Network, timeout, policy, and response-validation failures are
    // recoverable upstream outages, not proof that a title does not exist.
    throw new MetadataProvidersUnavailableError();
  }

  /**
   * Compatibility wrapper for stream-card consumers. It shares the fast
   * discovery cache with playback planning but intentionally exposes only the
   * existing raw stream response shape to this route.
   */
  async getStreams(
    userId: string,
    type: string,
    id: string,
    requestId: string,
    options: StreamDiscoveryRequestOptions = {},
  ): Promise<Stream[]> {
    const discovery = await this.getStreamDiscovery(
      userId,
      type,
      id,
      requestId,
      options,
    );
    return discovery.streams;
  }

  private consumeRealDebridResolutionQuota(userId: string) {
    const now = Date.now();
    for (const [key, entry] of this.realDebridResolutionQuota) {
      if (now - entry.windowStartedAt >= REAL_DEBRID_RESOLUTION_WINDOW_MS) {
        this.realDebridResolutionQuota.delete(key);
      }
    }

    const current = this.realDebridResolutionQuota.get(userId);
    if (
      current &&
      current.count >= SECURITY_LIMITS.realDebridResolutionsPerMinute
    ) {
      return false;
    }

    if (!current) {
      this.realDebridResolutionQuota.set(userId, {
        windowStartedAt: now,
        count: 1,
      });
    } else {
      current.count += 1;
    }

    while (
      this.realDebridResolutionQuota.size > SECURITY_LIMITS.boundedMapEntries
    ) {
      const oldest = this.realDebridResolutionQuota.keys().next().value;
      if (oldest === undefined) break;
      this.realDebridResolutionQuota.delete(oldest);
    }
    return true;
  }

  private async assertDiscoveredStream(
    userId: string,
    type: string,
    id: string,
    infoHash: string,
    requestId: string,
  ) {
    const discovery = await this.getStreamDiscovery(
      userId,
      type,
      id,
      requestId,
      {
        requireComplete: true,
      },
    );
    const requestedHash = normalizeInfoHash(infoHash);
    const authorized = discovery.streams.some(
      (stream) => normalizeInfoHash(stream.infoHash) === requestedHash,
    );
    if (!authorized) {
      throw new AppError(
        403,
        "The selected source is not authorized for this title.",
        "SOURCE_NOT_AUTHORIZED",
      );
    }
  }

  /** Resolve a specific stream (torrent) via Debrid if enabled, otherwise return original */
  async resolveStream(
    userId: string,
    type: string,
    id: string,
    infoHash: string,
    requestId: string,
  ) {
    const normalizedInfoHash = normalizeInfoHash(infoHash);
    if (!normalizedInfoHash) {
      throw new AppError(
        400,
        "Info hash contains unsupported characters.",
        "INVALID_INFO_HASH",
      );
    }

    const isRdEnabled = featureFlags.getAll()["real-debrid"];
    const magnet = `magnet:?xt=urn:btih:${normalizedInfoHash}`;

    if (isRdEnabled) {
      const rd = await realDebridService.getResolver(userId);
      if (rd) {
        await this.assertDiscoveredStream(
          userId,
          type,
          id,
          normalizedInfoHash,
          requestId,
        );
        if (!this.consumeRealDebridResolutionQuota(userId)) {
          throw new AppError(
            429,
            "Real-Debrid resolution limit reached. Please try again later.",
            "REAL_DEBRID_QUOTA",
          );
        }
        const resolved = await rd.resolve(
          { infoHash: normalizedInfoHash, title: id },
          requestId,
        );
        if (resolved) return resolved;
      }
    }

    // Fallback: Return original magnet link
    return {
      url: magnet,
      type: "magnet",
    };
  }

  /** Bulk-resolve multiple infoHashes in a single request (eliminates N+1 from detail screen) */
  async resolveStreamsBulk(
    userId: string,
    type: string,
    id: string | undefined,
    infoHashes: string[],
    requestId: string,
  ): Promise<Record<string, ResolvedStream | { url: string; type: string }>> {
    const results: Array<
      PromiseSettledResult<ResolvedStream | { url: string; type: string }>
    > = new Array(infoHashes.length);
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= infoHashes.length) return;
        try {
          results[index] = {
            status: "fulfilled",
            value: await this.resolveStream(
              userId,
              type,
              id ?? infoHashes[index],
              infoHashes[index],
              requestId,
            ),
          };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            SECURITY_LIMITS.bulkResolveConcurrency,
            infoHashes.length,
          ),
        },
        () => worker(),
      ),
    );

    const resolved: Record<
      string,
      ResolvedStream | { url: string; type: string }
    > = {};
    for (let i = 0; i < infoHashes.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        resolved[infoHashes[i]] = result.value;
      } else {
        if (isResolutionSecurityError(result.reason)) {
          throw result.reason;
        }
        // Fallback: raw magnet
        resolved[infoHashes[i]] = {
          url: `magnet:?xt=urn:btih:${infoHashes[i]}`,
          type: "magnet",
        };
      }
    }

    return resolved;
  }

  /** Search across all add-ons and all content types simultaneously, deduplicating by ID */
  async search(
    userId: string,
    query: string,
    requestId: string,
  ): Promise<MetaPreview[]> {
    return (await this.searchWithProvenance(userId, query, requestId)).metas;
  }

  /** Search while preserving which installed providers returned each title. */
  async searchWithProvenance(
    userId: string,
    query: string,
    requestId: string,
    options: SearchRequestOptions = {},
  ): Promise<SearchResponse> {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 2) return emptySearchResponse();

    const requestedType = options.type ?? "all";
    const mode = options.mode ?? "results";
    const maximumLimit = mode === "suggestions" ? SUGGESTION_LIMIT : 100;
    const defaultLimit =
      mode === "suggestions" ? SUGGESTION_LIMIT : RESULT_LIMIT;
    const limit = Math.max(
      1,
      Math.min(options.limit ?? defaultLimit, maximumLimit),
    );
    const cacheKey = `${userId}\u0000${requestedType}\u0000${normalizedQuery}`;
    const snapshotScopeKey = `${cacheKey}\u0000${mode}`;
    let offset = 0;
    let activeSnapshotId: string | undefined;
    let baseResult: CachedSearchResponse | undefined;

    if (typeof options.cursor === "string") {
      const decoded = decodeSearchCursor(options.cursor);
      offset = decoded.offset;
      const snapshot = this.getSearchSnapshot(
        decoded.snapshotId,
        snapshotScopeKey,
      );
      // Opaque cursors promise a stable server-side snapshot. Silently
      // refetching after expiry (or for another query/user) changes page
      // boundaries and can leak cursor validity across scopes.
      if (!snapshot) throw new InvalidSearchCursorError();
      baseResult = snapshot.value;
      activeSnapshotId = snapshot.id;
    } else if (options.cursor !== undefined) {
      if (
        !Number.isSafeInteger(options.cursor) ||
        options.cursor < 0 ||
        options.cursor > 100_000
      ) {
        throw new InvalidSearchCursorError();
      }
      offset = options.cursor;
    }

    if (!baseResult) {
      const cached = this.searchCache.get(cacheKey);
      const canReuseCache =
        cached &&
        cached.expiresAt > Date.now() &&
        (mode === "suggestions" ||
          cached.origin === "results" ||
          isCompleteSearchResult(cached.value));

      if (canReuseCache) {
        baseResult = cached.value;
      } else {
        if (cached && cached.expiresAt <= Date.now()) {
          this.deleteSearchCacheEntry(cacheKey);
        }

        const firstRun = this.getOrStartSearchRun(cacheKey, mode, (runSignal) =>
          this.performSearch(
            userId,
            query,
            requestId,
            requestedType,
            mode,
            runSignal,
          ),
        );
        const firstResult = await this.waitForSearchRun(
          firstRun,
          options.signal,
        );
        baseResult = firstResult;
        this.storeSearchCache(cacheKey, firstRun.mode, baseResult);
      }
    }

    const metas = baseResult.metas.slice(offset, offset + limit);
    const visibleKeys = new Set(metas.map((meta) => `${meta.type}:${meta.id}`));
    const nextOffset = offset + metas.length;

    let nextCursor: string | undefined;
    if (mode === "results" && nextOffset < baseResult.total) {
      activeSnapshotId ??= this.storeSearchSnapshot(
        snapshotScopeKey,
        baseResult,
      );
      nextCursor = activeSnapshotId
        ? encodeSearchCursor(activeSnapshotId, nextOffset)
        : String(nextOffset);
    }

    return {
      ...baseResult,
      metas,
      providersByContent: Object.fromEntries(
        Object.entries(baseResult.providersByContent).filter(([key]) =>
          visibleKeys.has(key),
        ),
      ),
      nextCursor,
    };
  }

  private async performSearch(
    userId: string,
    query: string,
    requestId: string,
    requestedType: SearchContentType,
    mode: SearchMode,
    signal?: AbortSignal,
  ): Promise<CachedSearchResponse> {
    const searchAddons = await this.getSearchUserAddons(userId);
    const addons = searchAddons.addons;
    const timeoutMs =
      mode === "suggestions" ? SUGGESTION_TIMEOUT_MS : RESULT_TIMEOUT_MS;
    let searchWasTruncated = searchAddons.truncated;

    // Search capability is declared per catalog. Providers frequently expose
    // a non-searchable discovery catalog first, so inspect every definition.
    const attempts: Array<{
      addonId: string;
      addonName: string;
      contentType: "movie" | "series";
      catalogId: string;
      run: () => Promise<{
        addonId: string;
        addonName: string;
        metas: MetaPreview[];
        truncated: boolean;
      }>;
    }> = [];
    let searchableProviders = 0;

    for (const addon of addons) {
      const uniqueCatalogs = new Map(
        getSearchableCatalogs(
          addon.manifest,
          requestedType === "all" ? undefined : requestedType,
        ).map((catalog) => [`${catalog.type}:${catalog.id}`, catalog]),
      );
      const catalogs = Array.from(uniqueCatalogs.values()).sort((a, b) =>
        `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
      );
      if (catalogs.length === 0) continue;
      if (searchableProviders >= MAX_SEARCH_PROVIDERS) {
        searchWasTruncated = true;
        continue;
      }
      searchableProviders += 1;
      if (catalogs.length > MAX_SEARCH_CATALOGS_PER_ADDON) {
        searchWasTruncated = true;
      }

      for (const catalog of catalogs.slice(0, MAX_SEARCH_CATALOGS_PER_ADDON)) {
        if (attempts.length >= MAX_SEARCH_ATTEMPTS) {
          searchWasTruncated = true;
          break;
        }
        attempts.push({
          addonId: addon.id as string,
          addonName: String(addon.manifest.name).slice(
            0,
            MAX_SEARCH_PROVIDER_NAME_LENGTH,
          ),
          contentType: catalog.type as "movie" | "series",
          catalogId: catalog.id,
          run: async () => {
            const path = buildCatalogPath(catalog.type, catalog.id, query);
            let upstreamTruncated = false;
            const data = await runSearchAttempt(
              (attemptSignal) =>
                searchOutboundBudget.run(
                  () =>
                    resilientFetch(
                      addon.transportUrl,
                      buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
                      path,
                      requestId,
                      strictSearchCatalogResponseSchema,
                      {
                        timeoutMs,
                        maxResponseBytes: MAX_SEARCH_RESPONSE_BYTES,
                        signal: attemptSignal,
                        callerSignal: signal,
                        nonRetryableClientErrors: true,
                        preparePayload: (value) => {
                          const bounded = boundSearchCatalogPayload(value);
                          upstreamTruncated = bounded.truncated;
                          return bounded.payload;
                        },
                      },
                    ),
                  attemptSignal,
                ),
              timeoutMs,
              signal,
            );
            const matchingMetas = data.metas.filter(
              (meta) => meta.type === catalog.type,
            );
            return {
              addonId: addon.id,
              addonName: String(addon.manifest.name).slice(
                0,
                MAX_SEARCH_PROVIDER_NAME_LENGTH,
              ),
              metas: matchingMetas.slice(0, MAX_RESULTS_PER_SEARCH_ATTEMPT),
              truncated:
                upstreamTruncated ||
                matchingMetas.length > MAX_RESULTS_PER_SEARCH_ATTEMPT,
            };
          },
        });
      }
    }

    const results = await Promise.allSettled(
      attempts.map((attempt) => attempt.run()),
    );
    if (signal?.aborted) {
      throw signal.reason ?? new Error("Search request cancelled.");
    }

    const providers = new Map<string, { id: string; name: string }>();
    const candidates: SearchCandidate[] = [];
    let candidateBytes = 0;
    const successfulProviderIds = new Set<string>();
    const providersWithFailedAttempts = new Set<string>();

    for (const [index, result] of results.entries()) {
      const attempt = attempts[index];
      if (result.status === "fulfilled") {
        const { addonId, addonName, metas, truncated } = result.value;
        if (truncated) searchWasTruncated = true;
        successfulProviderIds.add(addonId);
        providers.set(addonId, { id: addonId, name: addonName });
        for (const meta of metas) {
          const sizeBytes = Buffer.byteLength(JSON.stringify(meta), "utf8");
          if (
            candidates.length >= MAX_SEARCH_CANDIDATES ||
            candidateBytes + sizeBytes > MAX_SEARCH_CANDIDATE_BYTES
          ) {
            searchWasTruncated = true;
            continue;
          }
          candidates.push({ meta, providerId: addonId });
          candidateBytes += sizeBytes;
        }
      } else {
        providersWithFailedAttempts.add(attempt.addonId);
      }
    }

    const attemptedProviders = new Set(
      attempts.map((attempt) => attempt.addonId),
    ).size;
    const successfulProviders = successfulProviderIds.size;
    // A provider can support more than one searchable content type. Keep it in
    // the failed set when any of those attempts failed, even if another type
    // succeeded, so clients can truthfully communicate incomplete results.
    const failedProviderIds = Array.from(providersWithFailedAttempts).sort();
    const ranked = rankSearchCandidates(candidates, query);

    return {
      metas: ranked.metas,
      providers: Array.from(providers.values()).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      providersByContent: ranked.providersByContent,
      attemptedProviders,
      successfulProviders,
      failedProviderIds,
      partial: failedProviderIds.length > 0 && successfulProviders > 0,
      truncated: searchWasTruncated,
      total: ranked.metas.length,
    };
  }

  private async getSearchUserAddons(userId: string) {
    const rows = await prisma.installedAddon.findMany({
      where: { userId },
      orderBy: { installedAt: "asc" },
      take: MAX_SEARCH_ADDON_SCAN + 1,
    });
    return {
      truncated: rows.length > MAX_SEARCH_ADDON_SCAN,
      addons: rows.slice(0, MAX_SEARCH_ADDON_SCAN).map((a: any) => ({
        id: a.id,
        transportUrl: a.transportUrl,
        manifest: a.manifest as unknown as AddonManifest,
      })),
    };
  }

  /** Get installed add-ons for user, with manifests */
  private async getUserAddons(userId: string) {
    const addons = await prisma.installedAddon.findMany({
      where: { userId },
    });

    return addons.map((a: any) => ({
      id: a.id,
      transportUrl: a.transportUrl,
      manifest: a.manifest as unknown as AddonManifest,
    }));
  }

  private async getUserAddon(userId: string, addonId: string) {
    const addon = await prisma.installedAddon.findFirst({
      where: { id: addonId, userId },
    });

    if (!addon) return null;

    return {
      id: addon.id,
      transportUrl: addon.transportUrl,
      manifest: addon.manifest as unknown as AddonManifest,
    };
  }

  /** Check if an add-on supports a given resource type */
  private addonSupportsResource(
    manifest: AddonManifest,
    resource: string,
    contentType: string,
  ): boolean {
    if (requiresAddonConfiguration(manifest)) return false;

    if (resource === "catalog") {
      return supportsCatalogType(manifest, contentType);
    }

    const hasType = manifest.types.includes(contentType);
    const hasResource = manifest.resources.some((r) => {
      if (typeof r === "string") return r === resource;
      return r.name === resource && (!r.types || r.types.includes(contentType));
    });
    return hasType && hasResource;
  }

  /** Find the first catalog ID for a given content type */
  private findCatalogId(manifest: AddonManifest, type: string): string | null {
    const catalog = manifest.catalogs.find(
      (c) => c.type === type && c.id.trim().length > 0,
    );
    return catalog?.id ?? null;
  }
}

export const aggregatorService = new AggregatorService();
