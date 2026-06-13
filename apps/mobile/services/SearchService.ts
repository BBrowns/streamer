import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_SEARCHES_KEY = "RECENT_SEARCHES";
const LEGACY_SEARCHES_KEY = "@search_history";
const MAX_RECENT_SEARCHES = 10;

function parseSearches(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

export const SearchService = {
  async getRecentSearches(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      const current = parseSearches(data);
      if (current.length > 0) return current;

      const legacy = parseSearches(
        await AsyncStorage.getItem(LEGACY_SEARCHES_KEY),
      );
      if (legacy.length > 0) {
        const migrated = legacy.slice(0, MAX_RECENT_SEARCHES);
        await AsyncStorage.setItem(
          RECENT_SEARCHES_KEY,
          JSON.stringify(migrated),
        );
        await AsyncStorage.removeItem(LEGACY_SEARCHES_KEY);
        return migrated;
      }

      return [];
    } catch (e) {
      console.error("Failed to load recent searches", e);
      return [];
    }
  },

  async addRecentSearch(query: string) {
    if (!query || query.trim().length === 0) return;
    const cleanQuery = query.trim();

    try {
      const current = await this.getRecentSearches();
      const filtered = current.filter(
        (q) => q.toLowerCase() !== cleanQuery.toLowerCase(),
      );
      const updated = [cleanQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save recent search", e);
    }
  },

  async removeRecentSearch(query: string) {
    try {
      const current = await this.getRecentSearches();
      const updated = current.filter((q) => q !== query);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to remove recent search", e);
    }
  },

  async clearRecentSearches() {
    try {
      await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
      console.error("Failed to clear recent searches", e);
    }
  },
};
