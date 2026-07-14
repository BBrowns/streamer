import { useSearch } from "./useSearch";

/**
 * Search across all installed add-ons simultaneously.
 * Uses the backend /api/search?q= endpoint which broadcasts
 * to all addons via Promise.allSettled and deduplicates by ID.
 */
export function useGlobalSearch(query: string) {
  return useSearch(query, { minimumLength: 2 });
}
