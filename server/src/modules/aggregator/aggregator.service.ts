import { prisma } from "../../prisma/client.js";
import { type ResilienceMetrics, resilienceRegistry } from "./resilience.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { realDebridService } from "../debrid/real-debrid.service.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import { AppError } from "../../middleware/error.middleware.js";
import {
  catalogResponseSchema,
  metaResponseSchema,
  type MetaPreview,
  type MetaDetail,
  type Stream,
  SECURITY_LIMITS,
} from "@streamer/shared";
import {
  addonSupportsResource,
  findCatalogId,
  getUserAddon,
  getUserAddons,
} from "./addon-data.js";
import { AggregatorSearchService } from "./aggregator-search.service.js";
import { MAX_SEARCH_PROVIDER_NAME_LENGTH } from "./search-schema.js";
import {
  StreamDiscoveryService,
  type StreamDiscoveryRequestOptions,
} from "./stream-discovery.service.js";
import { SubtitleProviderService } from "./subtitle-provider.service.js";
import { isExplicitMetadataNotFound } from "./upstream-status.js";

const MAX_RESILIENCE_DIAGNOSTIC_PROVIDERS = 64;
const REAL_DEBRID_RESOLUTION_WINDOW_MS = 60_000;
import {
  buildAddonPolicyKey,
  buildCatalogPath,
  resilientFetch,
} from "./upstream.js";

export { buildAddonPolicyKey, buildCatalogPath } from "./upstream.js";
export {
  boundSearchCatalogPayload,
  InvalidSearchCursorError,
} from "./search-schema.js";
export type { SearchRequestOptions } from "./search-schema.js";
export type {
  StreamDiscoveryRequestOptions,
  StreamDiscoveryResult,
  StreamDiscoveryStatus,
} from "./stream-discovery.service.js";

export class MetadataProvidersUnavailableError extends Error {
  constructor() {
    super("No metadata provider completed successfully.");
    this.name = "MetadataProvidersUnavailableError";
  }
}

const INFO_HASH_PATTERN = /^[a-z0-9]{1,128}$/i;

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

export class AggregatorService {
  private readonly searchService = new AggregatorSearchService();
  private readonly subtitleProvider = new SubtitleProviderService();
  private readonly streamDiscovery = new StreamDiscoveryService();

  async getSubtitleCandidates(
    ...args: Parameters<SubtitleProviderService["getSubtitleCandidates"]>
  ) {
    return this.subtitleProvider.getSubtitleCandidates(...args);
  }

  async getSubtitleDocument(
    ...args: Parameters<SubtitleProviderService["getSubtitleDocument"]>
  ) {
    return this.subtitleProvider.getSubtitleDocument(...args);
  }

  async getStreamDiscovery(
    ...args: Parameters<StreamDiscoveryService["getStreamDiscovery"]>
  ) {
    return this.streamDiscovery.getStreamDiscovery(...args);
  }

  invalidateStreamDiscoveryCacheForUser(userId: string) {
    this.streamDiscovery.invalidateStreamDiscoveryCacheForUser(userId);
  }

  async search(
    userId: string,
    query: string,
    requestId: string,
  ): Promise<MetaPreview[]> {
    return this.searchService.search(userId, query, requestId);
  }

  async searchWithProvenance(
    ...args: Parameters<AggregatorSearchService["searchWithProvenance"]>
  ) {
    return this.searchService.searchWithProvenance(...args);
  }

  invalidateSearchCacheForUser(userId: string) {
    this.searchService.invalidateSearchCacheForUser(userId);
  }

  private readonly realDebridResolutionQuota = new Map<
    string,
    { windowStartedAt: number; count: number }
  >();

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
    const addons = await getUserAddons(userId);

    const results = await Promise.allSettled(
      addons
        .filter((a: any) => addonSupportsResource(a.manifest, "catalog", type))
        .map(async (addon: any) => {
          const catalogId = findCatalogId(addon.manifest, type);
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
    const addon = await getUserAddon(userId, addonId);
    if (!addon) {
      throw new Error("Add-on not installed");
    }

    if (!addonSupportsResource(addon.manifest, "catalog", type)) {
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
    const addons = await getUserAddons(userId);
    const metaProviders = addons.filter((addon: any) =>
      addonSupportsResource(addon.manifest, "meta", type),
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
}

export const aggregatorService = new AggregatorService();
