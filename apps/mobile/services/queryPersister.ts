/**
 * AsyncStorage-backed React Query persister for offline caching.
 *
 * Serializes the dehydrated query cache to AsyncStorage so library,
 * catalog, and meta queries survive app restarts. Only persists queries
 * matching allowed prefixes to keep storage lean.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

const CACHE_KEY = 'STREAMER_QUERY_CACHE';

/**
 * Maximum age for cached data (24 hours).
 * Anything older is discarded on rehydration.
 */
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * Only queries with these key prefixes get persisted.
 * Keeps the cache small and avoids persisting transient data
 * like search results or player state.
 */
const PERSISTED_QUERY_PREFIXES = ['library', 'catalog', 'meta', 'addons'];

interface PersistedCache {
    timestamp: number;
    state: ReturnType<typeof dehydrate>;
}

/**
 * Restore cached queries from AsyncStorage into the QueryClient.
 * Call once on app startup before rendering.
 */
export async function restoreQueryCache(queryClient: QueryClient): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) return;

        const parsed: PersistedCache = JSON.parse(raw);

        // Discard stale cache
        if (Date.now() - parsed.timestamp > CACHE_MAX_AGE) {
            await AsyncStorage.removeItem(CACHE_KEY);
            return;
        }

        hydrate(queryClient, parsed.state);
    } catch {
        // Corrupt or unreadable — silently ignore
    }
}

/**
 * Persist the current query cache to AsyncStorage.
 * Call on app background / periodic intervals.
 */
export async function persistQueryCache(queryClient: QueryClient): Promise<void> {
    try {
        const dehydrated = dehydrate(queryClient, {
            shouldDehydrateQuery: (query) => {
                // Only persist successful queries with matching prefixes
                if (query.state.status !== 'success') return false;
                const key = query.queryKey;
                return (
                    Array.isArray(key) &&
                    typeof key[0] === 'string' &&
                    PERSISTED_QUERY_PREFIXES.some((p) => (key[0] as string).startsWith(p))
                );
            },
        });

        const cache: PersistedCache = {
            timestamp: Date.now(),
            state: dehydrated,
        };

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Storage full or write failed — silently ignore
    }
}

/**
 * Clear the persisted query cache.
 * Call on logout to remove user-specific cached data.
 */
export async function clearQueryCache(): Promise<void> {
    try {
        await AsyncStorage.removeItem(CACHE_KEY);
    } catch {
        // Silently ignore
    }
}
