import Fuse from "fuse.js";
import axios from "axios";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { createAddonPolicy } from "./resilience.js";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import type {
  AddonManifest,
  MetaPreview,
  MetaDetail,
  Stream,
} from "@streamer/shared";
import type { IPolicy } from "cockatiel";

// Per-addon policy cache to maintain circuit breaker state
const policyCache = new Map<string, IPolicy>();

function getPolicy(addonId: string): IPolicy {
  let policy = policyCache.get(addonId);
  if (!policy) {
    policy = createAddonPolicy(addonId);
    policyCache.set(addonId, policy);
  }
  return policy;
}

/** Resilient fetch wrapper for add-on requests */
async function resilientFetch<T>(
  transportUrl: string,
  addonId: string,
  resourcePath: string,
  requestId: string,
): Promise<T> {
  const policy = getPolicy(addonId);
  const base = transportUrl
    .replace(/\/manifest\.json\/?$/, "")
    .replace(/\/$/, "");
  const url = `${base}/${resourcePath}`;

  const start = Date.now();

  try {
    const result = await policy.execute(async () => {
      logger.debug({ requestId, addonId, url }, "Fetching from add-on");
      const { data } = await axios.get<T>(url, { timeout: 5000 });
      return data;
    });

    logger.info(
      { requestId, addonId, latencyMs: Date.now() - start },
      "Add-on fetch success",
    );

    return result;
  } catch (err: any) {
    logger.warn(
      { requestId, addonId, latencyMs: Date.now() - start, error: err.message },
      "Add-on fetch failed",
    );
    throw err;
  }
}

export class AggregatorService {
  /** Fetch catalogs from all installed add-ons and merge results */
  async getCatalog(
    userId: string,
    type: string,
    requestId: string,
    search?: string,
    skip?: number,
    catalogId?: string,
  ): Promise<MetaPreview[]> {
    const addons = await this.getUserAddons(userId);

    const results = await Promise.allSettled(
      addons
        .filter((a) => {
          const supportsType = this.addonSupportsResource(
            a.manifest,
            "catalog",
            type,
          );
          if (!supportsType) return false;
          if (catalogId) {
            return a.manifest.catalogs.some(
              (c) => c.id === catalogId && c.type === type,
            );
          }
          return true;
        })
        .map(async (addon) => {
          const actualCatalogId =
            catalogId || this.findCatalogId(addon.manifest, type);
          if (!actualCatalogId) return [];

          // Use Stremio standard: catalog/{type}/{id}/{extra}.json
          // If no extras, it's just catalog/{type}/{id}.json
          const extras: string[] = [];
          if (search) extras.push(`search=${encodeURIComponent(search)}`);
          if (skip) extras.push(`skip=${skip}`);

          let path: string;
          if (extras.length > 0) {
            path = `catalog/${type}/${actualCatalogId}/${extras.join("&")}.json`;
          } else {
            path = `catalog/${type}/${actualCatalogId}.json`;
          }

          const data = await resilientFetch<{ metas: MetaPreview[] }>(
            addon.transportUrl,
            addon.manifest.id,
            path,
            requestId,
          );
          logger.debug(
            {
              requestId,
              addonId: addon.manifest.id,
              catalogId: actualCatalogId,
              path,
              itemCount: data?.metas?.length || 0,
            },
            "Fetched catalog",
          );
          return data.metas || [];
        }),
    );

    // Merge and deduplicate by ID across all add-ons for this catalog
    const seen = new Set<string>();
    const merged: MetaPreview[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const meta of result.value) {
          if (!seen.has(meta.id)) {
            seen.add(meta.id);
            merged.push(meta);
          }
        }
      }
    }

    return merged;
  }

  /** Fetch metadata from add-ons that support this type/id */
  async getMeta(
    userId: string,
    type: string,
    id: string,
    requestId: string,
  ): Promise<MetaDetail | null> {
    const addons = await this.getUserAddons(userId);

    const results = await Promise.allSettled(
      addons
        .filter((a) => this.addonSupportsResource(a.manifest, "meta", type))
        .map(async (addon) => {
          const data = await resilientFetch<{ meta: MetaDetail }>(
            addon.transportUrl,
            addon.manifest.id,
            `meta/${type}/${id}.json`,
            requestId,
          );
          return data.meta;
        }),
    );

    // Return the first successful result
    const fulfilled = results.find(
      (r): r is PromiseFulfilledResult<MetaDetail> => r.status === "fulfilled",
    );

    return fulfilled?.value ?? null;
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
        .filter((a) => this.addonSupportsResource(a.manifest, "stream", type))
        .map(async (addon) => {
          const data = await resilientFetch<{ streams: Stream[] }>(
            addon.transportUrl,
            addon.manifest.id,
            `stream/${type}/${id}.json`,
            requestId,
          );
          return data.streams || [];
        }),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<Stream[]> => r.status === "fulfilled",
      )
      .flatMap((r) => r.value)
      .map((stream) => this.enrichStream(stream))
      .sort((a, b) => this.compareStreams(a, b));
  }

  /** Parse title for resolution and seeders */
  private enrichStream(stream: Stream): Stream {
    const title = stream.title || stream.name || "";

    // Parse resolution (4K, 2160p, 1080p, 720p, 480p)
    if (!stream.resolution) {
      if (/4k|2160p/i.test(title)) stream.resolution = "2160p";
      else if (/1080p/i.test(title)) stream.resolution = "1080p";
      else if (/720p/i.test(title)) stream.resolution = "720p";
      else if (/480p/i.test(title)) stream.resolution = "480p";
    }

    // Parse seeders if present in title (e.g. "S: 120 P: 5" or "120 seeders")
    if (stream.seeders === undefined) {
      const seederMatch =
        title.match(/S:\s*(\d+)/i) || title.match(/(\d+)\s*seeders/i);
      if (seederMatch) {
        stream.seeders = parseInt(seederMatch[1], 10);
      }
    }

    return stream;
  }

  /** Sort by resolution (desc) then seeders (desc) */
  private compareStreams(a: Stream, b: Stream): number {
    const resMap: Record<string, number> = {
      "2160p": 4,
      "1080p": 3,
      "720p": 2,
      "480p": 1,
    };

    const resA = resMap[a.resolution || ""] || 0;
    const resB = resMap[b.resolution || ""] || 0;

    if (resA !== resB) return resB - resA;
    return (b.seeders || 0) - (a.seeders || 0);
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
    infoHashes: string[],
    requestId: string,
  ): Promise<Record<string, ResolvedStream | { url: string; type: string }>> {
    const results = await Promise.allSettled(
      infoHashes.map((infoHash) =>
        this.resolveStream(userId, type, infoHash, infoHash, requestId),
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

  /** Search across all add-ons and all content types simultaneously, deduplicating by ID and re-ranking */
  async search(
    userId: string,
    query: string,
    requestId: string,
  ): Promise<MetaPreview[]> {
    try {
      const addons = await this.getUserAddons(userId);
      const contentTypes = ["movie", "series"];

      // Build all search tasks across all addons × all content types
      const tasks = addons.flatMap((addon) =>
        contentTypes
          .filter((type) =>
            this.addonSupportsResource(addon.manifest, "catalog", type),
          )
          .map(async (type) => {
            // Find a catalog that explicitly supports search, or fallback to the first one
            const catalog =
              addon.manifest.catalogs.find(
                (c) =>
                  c.type === type && c.extra?.some((e) => e.name === "search"),
              ) || addon.manifest.catalogs.find((c) => c.type === type);

            if (!catalog) return [];
            const catalogId = catalog.id;

            const path = `catalog/${type}/${catalogId}/search=${encodeURIComponent(query)}.json`;
            try {
              const data = await resilientFetch<{ metas: MetaPreview[] }>(
                addon.transportUrl,
                addon.manifest.id,
                path,
                requestId,
              );
              logger.debug(
                {
                  requestId,
                  addonId: addon.manifest.id,
                  catalogId,
                  path,
                  itemCount: data?.metas?.length || 0,
                },
                "Fetched search results",
              );
              return data.metas || [];
            } catch (err: any) {
              // Silently swallow search failures from individual addons to keep results flowing
              logger.warn(
                { requestId, addonId: addon.manifest.id, error: err.message },
                "Search fetch failed for addon",
              );
              return [];
            }
          }),
      );

      const results = await Promise.allSettled(tasks);

      // Merge and deduplicate by ID
      const seen = new Set<string>();
      const merged: MetaPreview[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const meta of result.value) {
            if (
              meta &&
              typeof meta === "object" &&
              meta.id &&
              !seen.has(meta.id)
            ) {
              seen.add(meta.id);
              merged.push(meta);
            }
          }
        }
      }

      if (merged.length === 0) return [];

      // --- RE-RANKING LOGIC ---
      // 1. Fuzzy match scoring (40% weight)
      // 2. Popularity / Rating scoring (60% weight)

      // ESM Interop safety
      const FuseConstructor: any = (Fuse as any).default || Fuse;

      const fuse = new FuseConstructor(merged, {
        keys: ["name"],
        includeScore: true,
        threshold: 0.5, // Slightly more relaxed threshold
      });

      const fuzzyResults = fuse.search(query);

      // Map merged items to their scores for sorting
      const scoredMetas = merged.map((meta) => {
        const fuzzyMatch: any = fuzzyResults.find(
          (r: any) => r.item.id === meta.id,
        );

        // Fuse score: 0 = perfect, 1 = no match.
        // We normalize so 1 = perfect, 0 = no match.
        const textScore = fuzzyMatch ? 1 - (fuzzyMatch.score || 0) : 0;

        // Normalize IMDB rating (0.0 to 1.0)
        const rating = parseFloat(meta.imdbRating || "0");
        const popularityScore = isNaN(rating) ? 0 : Math.min(rating / 10, 1.0);

        // Weighted final score
        const finalScore = textScore * 0.4 + popularityScore * 0.6;

        return { meta, finalScore: isNaN(finalScore) ? 0 : finalScore };
      });

      // Sort descending by total score
      scoredMetas.sort((a, b) => b.finalScore - a.finalScore);

      return scoredMetas.map((sm) => sm.meta);
    } catch (err: any) {
      logger.error(
        { requestId, err: err.message, stack: err.stack },
        "Search re-ranking crashed",
      );
      // Fallback: return everything raw if re-ranking fails
      return [];
    }
  }

  /** Get installed add-ons for user, with manifests */
  private async getUserAddons(userId: string) {
    const addons = await prisma.installedAddon.findMany({
      where: { userId },
    });

    return addons
      .map((a) => {
        try {
          const manifest =
            typeof a.manifest === "string"
              ? JSON.parse(a.manifest)
              : a.manifest;
          return {
            transportUrl: a.transportUrl,
            manifest: manifest as AddonManifest,
          };
        } catch (err) {
          logger.error(
            { addonId: a.id, error: err },
            "Failed to parse addon manifest",
          );
          return null;
        }
      })
      .filter(
        (a): a is { transportUrl: string; manifest: AddonManifest } =>
          a !== null,
      );
  }

  /** Check if an add-on supports a given resource type */
  private addonSupportsResource(
    manifest: AddonManifest,
    resource: string,
    contentType: string,
  ): boolean {
    const hasType = manifest.types.includes(contentType);
    const hasResource = manifest.resources.some((r) => {
      if (typeof r === "string") return r === resource;
      return r.name === resource && (!r.types || r.types.includes(contentType));
    });
    return hasType && hasResource;
  }

  /** Find the first catalog ID for a given content type */
  private findCatalogId(manifest: AddonManifest, type: string): string | null {
    const catalog = manifest.catalogs.find((c) => c.type === type);
    return catalog?.id ?? null;
  }
}

export const aggregatorService = new AggregatorService();
