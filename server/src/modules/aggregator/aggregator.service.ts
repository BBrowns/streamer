import axios from "axios";
import https from "https";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { resilienceRegistry } from "./resilience.js";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver.js";
import type { ResolvedStream } from "../debrid/ports/debrid.ports.js";
import { featureFlags } from "../feature-flag/feature-flag.service.js";
import { validateSafeUrl } from "../../utils/security.js";
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

// Per-addon policy registry is now handled by resilienceRegistry

const secureAgent = new https.Agent({
  maxSockets: 50,
  keepAlive: true,
});

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

  // SSRF Protection: Enforce HTTPS and IP restrictions
  await validateSafeUrl(url);

  const start = Date.now();

  try {
    const result = await policy.execute(async () => {
      logger.debug({ requestId, addonId, url }, "Fetching from add-on");

      const { data } = await axios.get(url, {
        timeout: 5000,
        httpsAgent: secureAgent,
        maxContentLength: 1024 * 1024, // 1MB limit for sanitation
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

          let path = `catalog/${type}/${catalogId}.json`;
          const extras: string[] = [];
          if (search) extras.push(`search=${encodeURIComponent(search)}`);
          if (skip) extras.push(`skip=${skip}`);
          if (extras.length > 0) path += `?${extras.join("&")}`;

          const data = await resilientFetch(
            addon.transportUrl,
            addon.manifest.id,
            path,
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
      .map((stream: any) => StreamParser.enrich(stream))
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

  /** Search across all add-ons and all content types simultaneously, deduplicating by ID */
  async search(
    userId: string,
    query: string,
    requestId: string,
  ): Promise<MetaPreview[]> {
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
          if (!catalogId) return [];

          const path = `catalog/${type}/${catalogId}/search=${encodeURIComponent(query)}.json`;
          const data = await resilientFetch(
            addon.transportUrl,
            addon.manifest.id,
            path,
            requestId,
            catalogResponseSchema,
          );
          return data.metas || [];
        }),
    );

    const results = await Promise.allSettled(tasks);

    // Merge and deduplicate by ID
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

  /** Get installed add-ons for user, with manifests */
  private async getUserAddons(userId: string) {
    const addons = await prisma.installedAddon.findMany({
      where: { userId },
    });

    return addons.map((a: any) => ({
      transportUrl: a.transportUrl,
      manifest: a.manifest as unknown as AddonManifest,
    }));
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
