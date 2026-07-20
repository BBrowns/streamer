import type {
  CatalogDefinition,
  InstalledAddon,
  LibraryItem,
  WatchProgress,
} from "@streamer/shared";

export type ProviderCatalogRow = {
  addon: InstalledAddon;
  catalog: CatalogDefinition;
  originalIndex: number;
};

/**
 * Keeps provider catalog names and items intact while ordering the existing
 * rails around private, local viewing signals. This deliberately does not
 * invent popularity or recommendation semantics from add-on responses.
 */
export function rankProviderCatalogRows(
  rows: readonly ProviderCatalogRow[],
  library: readonly LibraryItem[] = [],
  continueWatching: readonly WatchProgress[] = [],
): ProviderCatalogRow[] {
  const latest = [...continueWatching].sort(
    (left, right) =>
      (Date.parse(right.lastWatched || "") || 0) -
      (Date.parse(left.lastWatched || "") || 0),
  )[0];
  const affinity = new Map<string, number>();

  for (const item of library) {
    affinity.set(item.type, (affinity.get(item.type) ?? 0) + 1);
  }
  for (const item of continueWatching) {
    affinity.set(item.type, (affinity.get(item.type) ?? 0) + 3);
  }

  return [...rows].sort((left, right) => {
    const leftScore =
      (affinity.get(left.catalog.type) ?? 0) +
      (left.catalog.type === latest?.type ? 8 : 0);
    const rightScore =
      (affinity.get(right.catalog.type) ?? 0) +
      (right.catalog.type === latest?.type ? 8 : 0);
    return rightScore - leftScore || left.originalIndex - right.originalIndex;
  });
}
