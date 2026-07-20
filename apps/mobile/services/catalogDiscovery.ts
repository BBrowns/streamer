import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";

export type CatalogDiscoveryType = "all" | "movie" | "series";

export type CatalogDiscoveryRow = {
  addon: InstalledAddon;
  catalog: CatalogDefinition;
};

const SUPPORTED_BROWSE_TYPES = new Set(["movie", "series"]);

function normalizeExtraName(name: string) {
  return name.trim().toLocaleLowerCase("en-US");
}

/**
 * A catalog is browseable when the client can request it without first asking
 * the person for a required Stremio extra. `skip` is the one supported paging
 * extra, so it is safe to send automatically.
 */
export function canBrowseCatalog(catalog: CatalogDefinition) {
  if (!SUPPORTED_BROWSE_TYPES.has(catalog.type)) return false;

  return !(catalog.extra ?? []).some(
    (extra) => extra.isRequired && normalizeExtraName(extra.name) !== "skip",
  );
}

/**
 * Keep discovery limited to catalog providers. Stream-only add-ons remain
 * useful for playback, but cannot populate Home or Search with titles.
 */
export function buildCatalogDiscoveryRows(
  addons: readonly InstalledAddon[] | undefined,
  type: CatalogDiscoveryType = "all",
): CatalogDiscoveryRow[] {
  const seen = new Set<string>();
  const rows: CatalogDiscoveryRow[] = [];

  [...(addons ?? [])]
    .sort(
      (left, right) =>
        left.installedAt.localeCompare(right.installedAt) ||
        left.id.localeCompare(right.id),
    )
    .forEach((addon) => {
      if (addon.manifest.behaviorHints?.configurationRequired) return;

      addon.manifest.catalogs.forEach((catalog) => {
        if (!canBrowseCatalog(catalog)) return;
        if (type !== "all" && catalog.type !== type) return;

        const key = `${addon.id}:${catalog.type}:${catalog.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ addon, catalog });
      });
    });

  return rows;
}
