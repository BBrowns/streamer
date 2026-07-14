import https from "https";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { resilienceRegistry } from "./resilience.js";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import { fetchSafeAddonJson, safeUrlForLog } from "../addon/addon-fetcher.js";
import {
  catalogResponseSchema,
  metaResponseSchema,
  streamResponseSchema,
  type AddonManifest,
  type MetaPreview,
  type MetaDetail,
  type Stream,
} from "@streamer/shared";
import { z } from "zod";
import { StreamParser } from "./domain/stream-parser.js";

export interface SearchProviderFacet {
  id: string;
  name: string;
}

export interface SearchWithProvenanceResult {
  metas: MetaPreview[];
  providers: SearchProviderFacet[];
  providersByContent: Record<string, string[]>;
}

// Per-addon policy registry is now handled by resilienceRegistry

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

/** Resilient fetch wrapper for add-on requests with strict Zod validation */
async function resilientFetch<T>(
  transportUrl: string,
  addonId: string,
  resourcePath: string,
  requestId: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const policy = resilienceRegistry.getPolicy(addonId);

  const base = transportUrl
    .replace(/\/manifest\.json\/?$/, "")
    .replace(/\/$/, "");
  const url = `${base}/${resourcePath}`;

  const start = Date.now();

  try {
    const result = await policy.execute(async () => {
      logger.debug(
        { requestId, addonId, target: safeUrlForLog(url) },
        "Fetching from add-on",
      );

      const data = await fetchSafeAddonJson(url, {
        kind: "resource",
        axiosOptions: { httpsAgent: secureAgent },
      });

      // Strict Sanitation: Validate against expected Zod schema
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        logger.error(
          { requestId, addonId, errors: parsed.error.format() },
          "Add-on response failed validation",
        );
        throw new Error("Invalid response format from add-on");
      }

      return parsed.data;
    });

    logger.info(
      { requestId, addonId, latencyMs: Date.now() - start },
      "Add-on fetch success",
    );

    return result;
  } catch (err: any) {
    logger.warn(
      {
        requestId,
        addonId,
        latencyMs: Date.now() - start,
        target: safeUrlForLog(url),
        error: err.message,
      },
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
            addon.manifest.id,
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
      addon.manifest.id,
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

    const results = await Promise.allSettled(
      addons
        .filter((a: any) =>
          this.addonSupportsResource(a.manifest, "meta", type),
        )
        .map(async (addon: any) => {
          const data = await resilientFetch(
            addon.transportUrl,
            addon.manifest.id,
            `meta/${type}/${id}.json`,
            requestId,
            metaResponseSchema,
          );
          return data.meta;
        }),
    );

    // Return the first successful result
    const fulfilled = results.find(
      (r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
    );

    return (fulfilled?.value as MetaDetail) ?? null;
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
            addon.manifest.id,
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
  ): Promise<SearchWithProvenanceResult> {
    const addons = await this.getUserAddons(userId);
    const contentTypes = ["movie", "series"];

    // Build all search tasks across all addons × all content types
    const tasks = addons.flatMap((addon: any) =>
      contentTypes
        .filter((type) =>
          this.addonSupportsResource(addon.manifest, "catalog", type),
        )
        .map(async (type) => {
          const catalogId = this.findCatalogId(addon.manifest, type);
          if (!catalogId) {
            return {
              addonId: addon.id,
              addonName: addon.manifest.name,
              metas: [] as MetaPreview[],
            };
          }

          const path = `catalog/${type}/${catalogId}/search=${encodeURIComponent(query)}.json`;
          const data = await resilientFetch(
            addon.transportUrl,
            addon.manifest.id,
            path,
            requestId,
            catalogResponseSchema,
          );
          return {
            addonId: addon.id,
            addonName: addon.manifest.name,
            metas: data.metas || [],
          };
        }),
    );

    const results = await Promise.allSettled(tasks);

    // Merge and deduplicate by ID
    const seen = new Set<string>();
    const merged: MetaPreview[] = [];
    const providers = new Map<string, SearchProviderFacet>();
    const providersByContent = new Map<string, Set<string>>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { addonId, addonName, metas } = result.value;
        providers.set(addonId, { id: addonId, name: addonName });
        for (const meta of metas) {
          const contentKey = `${meta.type}:${meta.id}`;
          const contentProviders =
            providersByContent.get(contentKey) ?? new Set<string>();
          contentProviders.add(addonId);
          providersByContent.set(contentKey, contentProviders);
          if (!seen.has(contentKey)) {
            seen.add(contentKey);
            merged.push(meta);
          }
        }
      }
    }

    return {
      metas: merged,
      providers: Array.from(providers.values()),
      providersByContent: Object.fromEntries(
        Array.from(providersByContent, ([key, ids]) => [key, Array.from(ids)]),
      ),
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
