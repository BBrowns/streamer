import type { MetaPreview } from "@streamer/shared";

export type SearchFacetKey = "genre" | "language";

export interface SearchFacetOption {
  label: string;
  value: string;
}

const MAX_SEARCH_FACET_OPTIONS = 24;

function normalizeFacetValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function getSearchFacetValues(
  item: MetaPreview,
  key: SearchFacetKey,
): string[] {
  if (key === "genre") return item.genres ?? [];
  return item.originalLanguage ? [item.originalLanguage] : [];
}

export function buildSearchFacetOptions(
  items: readonly MetaPreview[],
  key: SearchFacetKey,
  anyLabel: string,
): SearchFacetOption[] {
  const labels = new Map<string, string>();
  for (const item of items) {
    for (const rawValue of getSearchFacetValues(item, key)) {
      const label = rawValue.trim().replace(/\s+/g, " ");
      const normalized = normalizeFacetValue(label);
      if (normalized && !labels.has(normalized)) labels.set(normalized, label);
    }
  }

  return [
    { label: anyLabel, value: "all" },
    ...Array.from(labels.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .slice(0, MAX_SEARCH_FACET_OPTIONS)
      .map(([value, label]) => ({ label, value })),
  ];
}

export function matchesSearchFacet(
  item: MetaPreview,
  key: SearchFacetKey,
  selected: string,
): boolean {
  if (selected === "all") return true;
  const normalizedSelected = normalizeFacetValue(selected);
  return getSearchFacetValues(item, key).some(
    (value) => normalizeFacetValue(value) === normalizedSelected,
  );
}
