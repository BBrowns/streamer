import axios from 'axios';
import { prisma } from '../../prisma/client.js';
import { logger } from '../../config/logger.js';
import { createAddonPolicy } from './resilience.js';
import type {
    AddonManifest,
    MetaPreview,
    MetaDetail,
    Stream,
} from '@streamer/shared';
import type { IPolicy } from 'cockatiel';

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
    const base = transportUrl.replace(/\/manifest\.json\/?$/, '').replace(/\/$/, '');
    const url = `${base}/${resourcePath}`;

    const start = Date.now();

    try {
        const result = await policy.execute(async () => {
            logger.debug({ requestId, addonId, url }, 'Fetching from add-on');
            const { data } = await axios.get<T>(url, { timeout: 5000 });
            return data;
        });

        logger.info(
            { requestId, addonId, latencyMs: Date.now() - start },
            'Add-on fetch success',
        );

        return result;
    } catch (err: any) {
        logger.warn(
            { requestId, addonId, latencyMs: Date.now() - start, error: err.message },
            'Add-on fetch failed',
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
                .filter((a) => this.addonSupportsResource(a.manifest, 'catalog', type))
                .map(async (addon) => {
                    const catalogId = this.findCatalogId(addon.manifest, type);
                    if (!catalogId) return [];

                    let path = `catalog/${type}/${catalogId}.json`;
                    const extras: string[] = [];
                    if (search) extras.push(`search=${encodeURIComponent(search)}`);
                    if (skip) extras.push(`skip=${skip}`);
                    if (extras.length > 0) path += `?${extras.join('&')}`;

                    const data = await resilientFetch<{ metas: MetaPreview[] }>(
                        addon.transportUrl,
                        addon.manifest.id,
                        path,
                        requestId,
                    );
                    return data.metas || [];
                }),
        );

        return results
            .filter((r): r is PromiseFulfilledResult<MetaPreview[]> => r.status === 'fulfilled')
            .flatMap((r) => r.value);
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
                .filter((a) => this.addonSupportsResource(a.manifest, 'meta', type))
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
            (r): r is PromiseFulfilledResult<MetaDetail> => r.status === 'fulfilled',
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
                .filter((a) => this.addonSupportsResource(a.manifest, 'stream', type))
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
            .filter((r): r is PromiseFulfilledResult<Stream[]> => r.status === 'fulfilled')
            .flatMap((r) => r.value);
    }

    /** Search across all add-ons and all content types simultaneously, deduplicating by ID */
    async search(
        userId: string,
        query: string,
        requestId: string,
    ): Promise<MetaPreview[]> {
        const addons = await this.getUserAddons(userId);
        const contentTypes = ['movie', 'series'];

        // Build all search tasks across all addons × all content types
        const tasks = addons.flatMap((addon) =>
            contentTypes
                .filter((type) => this.addonSupportsResource(addon.manifest, 'catalog', type))
                .map(async (type) => {
                    const catalogId = this.findCatalogId(addon.manifest, type);
                    if (!catalogId) return [];

                    const path = `catalog/${type}/${catalogId}/search=${encodeURIComponent(query)}.json`;
                    const data = await resilientFetch<{ metas: MetaPreview[] }>(
                        addon.transportUrl,
                        addon.manifest.id,
                        path,
                        requestId,
                    );
                    return data.metas || [];
                }),
        );

        const results = await Promise.allSettled(tasks);

        // Merge and deduplicate by ID
        const seen = new Set<string>();
        const merged: MetaPreview[] = [];

        for (const result of results) {
            if (result.status === 'fulfilled') {
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

        return addons.map((a) => ({
            transportUrl: a.transportUrl,
            manifest: JSON.parse(a.manifest as unknown as string) as AddonManifest,
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
            if (typeof r === 'string') return r === resource;
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
