import axios from "axios";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error.middleware.js";
import { validateSafeUrl } from "../../utils/security.js";
import { addonManifestSchema } from "@streamer/shared";
import type { AddonManifest, InstalledAddon } from "@streamer/shared";

export class AddonService {
  /** Fetch and validate manifest from a remote add-on URL */
  async fetchManifest(transportUrl: string): Promise<AddonManifest> {
    const base = transportUrl.replace(/\/$/, "");
    const manifestUrl = base.endsWith("/manifest.json")
      ? base
      : `${base}/manifest.json`;

    try {
      await validateSafeUrl(manifestUrl);

      const { data } = await axios.get(manifestUrl, { timeout: 5000 });
      const manifest = addonManifestSchema.parse(data);
      return manifest;
    } catch (err: any) {
      if (err.name === "ZodError") {
        throw new AppError(400, "Invalid add-on manifest format");
      }
      logger.warn(
        { transportUrl, error: err.message },
        "Failed to fetch add-on manifest",
      );
      throw new AppError(502, "Could not reach add-on at the provided URL");
    }
  }

  /** Install an add-on for a user */
  async install(userId: string, transportUrl: string): Promise<InstalledAddon> {
    const manifest = await this.fetchManifest(transportUrl);

    const existing = await prisma.installedAddon.findUnique({
      where: { userId_transportUrl: { userId, transportUrl } },
    });

    if (existing) {
      throw new AppError(409, "Add-on already installed");
    }

    const addon = await prisma.installedAddon.create({
      data: {
        userId,
        transportUrl,
        manifest: manifest as any,
        lastValidatedAt: new Date(),
      },
    });

    logger.info({ userId, addonId: manifest.id }, "Add-on installed");

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
      orderBy: { installedAt: "desc" },
    });

    const STALE_THRESHOLD = 12 * 60 * 60 * 1000; // 12 hours
    const now = Date.now();

    const results = addons.map((a) => {
      // Trigger background re-validation if stale
      const lastValidated = a.lastValidatedAt?.getTime() || 0;
      if (now - lastValidated > STALE_THRESHOLD) {
        this.revalidate(a.id).catch((err) => {
          logger.error(
            { addonId: a.id, error: err.message },
            "Background re-validation failed",
          );
        });
      }

      return {
        id: a.id,
        userId: a.userId,
        transportUrl: a.transportUrl,
        manifest: a.manifest as unknown as AddonManifest,
        installedAt: a.installedAt.toISOString(),
      };
    });

    return results;
  }

  /** Background re-validate a specific addon's manifest */
  async revalidate(addonId: string): Promise<void> {
    const addon = await prisma.installedAddon.findUnique({
      where: { id: addonId },
    });

    if (!addon) return;

    try {
      const newManifest = await this.fetchManifest(addon.transportUrl);

      // Compare versions or just update (Stremio manifests often have versions)
      await prisma.installedAddon.update({
        where: { id: addonId },
        data: {
          manifest: newManifest as any,
          lastValidatedAt: new Date(),
        },
      });

      logger.info(
        { addonId, transportUrl: addon.transportUrl },
        "Add-on manifest re-validated",
      );
    } catch (err: any) {
      // If re-validation fails, update lastValidatedAt anyway to prevent constant retries
      // but keep the old manifest. Or maybe wait less? Let's just update timestamp to "now"
      // to avoid hammering a dead URL.
      await prisma.installedAddon.update({
        where: { id: addonId },
        data: { lastValidatedAt: new Date() },
      });
      throw err;
    }
  }

  /** Uninstall an add-on */
  async uninstall(userId: string, addonId: string): Promise<void> {
    const addon = await prisma.installedAddon.findFirst({
      where: { id: addonId, userId },
    });

    if (!addon) {
      throw new AppError(404, "Add-on not found");
    }

    await prisma.installedAddon.delete({ where: { id: addonId } });
    logger.info({ userId, addonId }, "Add-on uninstalled");
  }
}

export const addonService = new AddonService();
