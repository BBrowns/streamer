import { prisma } from "../../prisma/client.js";
import {
  requiresAddonConfiguration,
  supportsCatalogType,
  type AddonManifest,
} from "@streamer/shared";

export type InstalledAddon = {
  id: string;
  transportUrl: string;
  manifest: AddonManifest;
};

export async function getUserAddons(userId: string): Promise<InstalledAddon[]> {
  const addons = await prisma.installedAddon.findMany({ where: { userId } });
  return addons.map((addon: any) => ({
    id: addon.id,
    transportUrl: addon.transportUrl,
    manifest: addon.manifest as unknown as AddonManifest,
  }));
}

export async function getUserAddon(
  userId: string,
  addonId: string,
): Promise<InstalledAddon | null> {
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

export async function getSearchUserAddons(userId: string, maximum = 64) {
  const rows = await prisma.installedAddon.findMany({
    where: { userId },
    orderBy: { installedAt: "asc" },
    take: maximum + 1,
  });
  return {
    truncated: rows.length > maximum,
    addons: rows.slice(0, maximum).map((addon: any) => ({
      id: addon.id,
      transportUrl: addon.transportUrl,
      manifest: addon.manifest as unknown as AddonManifest,
    })),
  };
}

export function addonSupportsResource(
  manifest: AddonManifest,
  resource: string,
  contentType: string,
): boolean {
  if (requiresAddonConfiguration(manifest)) return false;
  if (resource === "catalog") return supportsCatalogType(manifest, contentType);
  const hasType = manifest.types.includes(contentType);
  const hasResource = manifest.resources.some((entry) => {
    if (typeof entry === "string") return entry === resource;
    return (
      entry.name === resource &&
      (!entry.types || entry.types.includes(contentType))
    );
  });
  return hasType && hasResource;
}

export function findCatalogId(
  manifest: AddonManifest,
  type: string,
): string | null {
  const catalog = manifest.catalogs.find(
    (entry) => entry.type === type && entry.id.trim().length > 0,
  );
  return catalog?.id ?? null;
}
