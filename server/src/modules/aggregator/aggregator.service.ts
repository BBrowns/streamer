import https from "https";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import {
  NonRetryableUpstreamError,
  resilienceRegistry,
  type ResilienceMetrics,
} from "./resilience.js";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import { fetchSafeAddonJson, safeUrlForLog } from "../addon/addon-fetcher.js";
import {
  catalogResponseSchema,
  metaPreviewSchema,
  metaResponseSchema,
  streamResponseSchema,
  type AddonManifest,
  type MetaPreview,
  type MetaDetail,
  type Stream,
  type SearchResponse,
  requiresAddonConfiguration,
  supportsCatalogType,
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
const MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS = 64;
const GLOBAL_SEARCH_MAX_CONCURRENT = 8;
const GLOBAL_SEARCH_MAX_QUEUED = 64;

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

  /** Fetch streams from all add-ons and merge */
  async getStreams(
    userId: string,
    type: string,
    id: string,
    requestId: string,
  ): Promise<Stream[]> {
    const addons = await this.getUserAddons(userId);

    const results = await Promise.allSettled(
      addons
        .filter((a: any) =>
          this.addonSupportsResource(a.manifest, "stream", type),
        )
        .map(async (addon: any) => {
          const data = await resilientFetch(
            addon.transportUrl,
            buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
            `stream/${type}/${id}.json`,
            requestId,
            streamResponseSchema,
          );
          return data.streams || [];
        }),
    );

    return results
      .filter(
        (r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
      )
      .flatMap((r: any) => r.value as Stream[])
      .map((stream: any) => StreamParser.enrich({ ...stream, type, id }))
      .sort((a: any, b: any) => StreamParser.compare(a, b));
  }

  /** Resolve a specific stream (torrent) via Debrid if enabled, otherwise return original */
  async resolveStream(
    userId: string,
    type: string,
    id: string,
    infoHash: string,
    requestId: string,
  ) {
    const isRdEnabled = featureFlags.getAll()["real-debrid"];
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;

    if (isRdEnabled) {
      const rd = new RealDebridResolver();
      const resolved = await rd.resolve({ infoHash, title: id }, requestId);
      if (resolved) {
        return resolved;
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
    const results = await Promise.allSettled(
      infoHashes.map((infoHash) =>
        this.resolveStream(userId, type, id ?? infoHash, infoHash, requestId),
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
