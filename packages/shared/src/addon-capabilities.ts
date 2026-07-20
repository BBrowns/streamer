import type { AddonManifest } from "./types/manifest";

/** A manifest that still requires setup must not be queried as a provider. */
export function requiresAddonConfiguration(
  manifest: Pick<AddonManifest, "behaviorHints">,
): boolean {
  return manifest.behaviorHints?.configurationRequired === true;
}

/**
 * Some deployed Stremio add-ons serve catalog routes while omitting the
 * optional `catalog` entry from `resources`. A concrete catalog definition is
 * still an explicit capability declaration, provided its content type is in
 * the manifest's supported types.
 */
export function supportsCatalogType(
  manifest: Pick<AddonManifest, "types" | "catalogs" | "behaviorHints">,
  type: string,
  catalogId?: string,
): boolean {
  if (requiresAddonConfiguration(manifest)) return false;
  if (!manifest.types.includes(type)) return false;

  return manifest.catalogs.some(
    (catalog) =>
      catalog.type === type &&
      catalog.id.trim().length > 0 &&
      (catalogId === undefined || catalog.id === catalogId),
  );
}
