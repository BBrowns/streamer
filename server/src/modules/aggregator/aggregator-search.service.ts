import { type MetaPreview, type SearchResponse } from "@streamer/shared";
import {
  getSearchableCatalogs,
  normalizeSearchText,
  rankSearchCandidates,
  type SearchCandidate,
  type SearchContentType,
  type SearchMode,
} from "./search.js";
import {
  buildAddonPolicyKey,
  buildCatalogPath,
  resilientFetch,
} from "./upstream.js";
import { getSearchUserAddons } from "./addon-data.js";
import {
  boundSearchCatalogPayload,
  type CachedSearchEntry,
  type CachedSearchResponse,
  decodeSearchCursor,
  DEGRADED_SEARCH_CACHE_TTL_MS,
  emptySearchResponse,
  encodeSearchCursor,
  type InFlightSearchEntry,
  isCompleteSearchResult,
  InvalidSearchCursorError,
  MAX_RESULTS_PER_SEARCH_ATTEMPT,
  MAX_SEARCH_ADDON_SCAN,
  MAX_SEARCH_CANDIDATES,
  MAX_SEARCH_CANDIDATE_BYTES,
  MAX_SEARCH_CATALOGS_PER_ADDON,
  MAX_SEARCH_PROVIDER_NAME_LENGTH,
  MAX_SEARCH_PROVIDERS,
  MAX_SEARCH_RESPONSE_BYTES,
  MAX_SEARCH_ATTEMPTS,
  RESULT_LIMIT,
  RESULT_TIMEOUT_MS,
  SEARCH_CACHE_MAX_BYTES,
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_MAX_ENTRY_BYTES,
  SEARCH_CACHE_TTL_MS,
  SEARCH_SNAPSHOT_MAX_BYTES,
  SEARCH_SNAPSHOT_MAX_ENTRIES,
  SEARCH_SNAPSHOT_TTL_MS,
  searchOutboundBudget,
  type SearchRequestOptions,
  type SearchSnapshotEntry,
  searchResponseSizeBytes,
  SUGGESTION_LIMIT,
  SUGGESTION_TIMEOUT_MS,
  strictSearchCatalogResponseSchema,
} from "./search-schema.js";

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

export class AggregatorSearchService {
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
    const searchAddons = await getSearchUserAddons(
      userId,
      MAX_SEARCH_ADDON_SCAN,
    );
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
}
