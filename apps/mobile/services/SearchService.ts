import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_RECENT_SEARCHES_KEY = "RECENT_SEARCHES";
const LEGACY_SEARCHES_KEY = "@search_history";
const MAX_RECENT_SEARCHES = 10;
const ANONYMOUS_SEARCH_SCOPE = "anonymous";

function recentSearchesKey(ownerId?: string | null) {
  const scope = ownerId?.trim() || ANONYMOUS_SEARCH_SCOPE;
  return `RECENT_SEARCHES:${encodeURIComponent(scope)}`;
}

function parseSearches(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

export const SearchService = {
  async getRecentSearches(ownerId?: string | null): Promise<string[]> {
    try {
      const scopedKey = recentSearchesKey(ownerId);
      const data = await AsyncStorage.getItem(scopedKey);
      if (data !== null) return parseSearches(data);

      const currentLegacy = parseSearches(
        await AsyncStorage.getItem(LEGACY_RECENT_SEARCHES_KEY),
      );
      const legacy =
        currentLegacy.length > 0
          ? currentLegacy
          : parseSearches(await AsyncStorage.getItem(LEGACY_SEARCHES_KEY));
      if (legacy.length > 0) {
        const migrated = legacy.slice(0, MAX_RECENT_SEARCHES);
        await AsyncStorage.setItem(scopedKey, JSON.stringify(migrated));
        await Promise.all([
          AsyncStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY),
          AsyncStorage.removeItem(LEGACY_SEARCHES_KEY),
        ]);
        return migrated;
      }

      return [];
    } catch (e) {
      console.error("Failed to load recent searches", e);
      return [];
    }
  },

  async addRecentSearch(query: string, ownerId?: string | null) {
    if (!query || query.trim().length === 0) return;
    const cleanQuery = query.trim();

    try {
      const current = await this.getRecentSearches(ownerId);
      const filtered = current.filter(
        (q) => q.toLowerCase() !== cleanQuery.toLowerCase(),
      );
      const updated = [cleanQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      await AsyncStorage.setItem(
        recentSearchesKey(ownerId),
        JSON.stringify(updated),
      );
    } catch (e) {
      console.error("Failed to save recent search", e);
    }
  },

  async removeRecentSearch(query: string, ownerId?: string | null) {
    try {
      const current = await this.getRecentSearches(ownerId);
      const updated = current.filter((q) => q !== query);
      await AsyncStorage.setItem(
        recentSearchesKey(ownerId),
        JSON.stringify(updated),
      );
    } catch (e) {
      console.error("Failed to remove recent search", e);
    }
  },

  async clearRecentSearches(ownerId?: string | null) {
    try {
      await AsyncStorage.removeItem(recentSearchesKey(ownerId));
    } catch (e) {
      console.error("Failed to clear recent searches", e);
    }
  },
};
