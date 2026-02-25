import axios from 'axios';
import { prisma } from '../../prisma/client.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error.middleware.js';
import { addonManifestSchema } from '@streamer/shared';
import type { AddonManifest, InstalledAddon } from '@streamer/shared';

export class AddonService {
    /** Fetch and validate manifest from a remote add-on URL */
    async fetchManifest(transportUrl: string): Promise<AddonManifest> {
        const base = transportUrl.replace(/\/$/, '');
        const manifestUrl = base.endsWith('/manifest.json') ? base : `${base}/manifest.json`;

        try {
            const { data } = await axios.get(manifestUrl, { timeout: 5000 });
            const manifest = addonManifestSchema.parse(data);
            return manifest;
        } catch (err: any) {
            if (err.name === 'ZodError') {
                throw new AppError(400, 'Invalid add-on manifest format');
            }
            logger.warn({ transportUrl, error: err.message }, 'Failed to fetch add-on manifest');
            throw new AppError(502, 'Could not reach add-on at the provided URL');
        }
    }

    /** Install an add-on for a user */
    async install(userId: string, transportUrl: string): Promise<InstalledAddon> {
        const manifest = await this.fetchManifest(transportUrl);

        const existing = await prisma.installedAddon.findUnique({
            where: { userId_transportUrl: { userId, transportUrl } },
        });

        if (existing) {
            throw new AppError(409, 'Add-on already installed');
        }

        const addon = await prisma.installedAddon.create({
            data: {
                userId,
                transportUrl,
                manifest: manifest as any,
            },
        });

        logger.info({ userId, addonId: manifest.id }, 'Add-on installed');

        return {
            id: addon.id,
            userId: addon.userId,
            transportUrl: addon.transportUrl,
            manifest: addon.manifest as unknown as AddonManifest,
            installedAt: addon.installedAt.toISOString(),
        };
    }

    /** List all installed add-ons for a user */
    async list(userId: string): Promise<InstalledAddon[]> {
        const addons = await prisma.installedAddon.findMany({
            where: { userId },
            orderBy: { installedAt: 'desc' },
        });

        return addons.map((a) => ({
            id: a.id,
            userId: a.userId,
            transportUrl: a.transportUrl,
            manifest: a.manifest as unknown as AddonManifest,
            installedAt: a.installedAt.toISOString(),
        }));
    }

    /** Uninstall an add-on */
    async uninstall(userId: string, addonId: string): Promise<void> {
        const addon = await prisma.installedAddon.findFirst({
            where: { id: addonId, userId },
        });

        if (!addon) {
            throw new AppError(404, 'Add-on not found');
        }

        await prisma.installedAddon.delete({ where: { id: addonId } });
        logger.info({ userId, addonId }, 'Add-on uninstalled');
    }
}

export const addonService = new AddonService();
