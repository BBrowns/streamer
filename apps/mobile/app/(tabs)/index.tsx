import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useCatalog } from '../../hooks/useCatalog';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { useAuthStore } from '../../stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import type { MetaPreview } from '@streamer/shared';

function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
    >
      <Image source={{ uri: item.poster }} style={styles.poster} />
      <View style={styles.cardOverlay}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        {item.imdbRating && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>⭐ {item.imdbRating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const isSearching = debouncedSearch.length >= 2;

  // Use global search when user is searching, catalog otherwise
  const { data: searchResults, isLoading: searchLoading } = useGlobalSearch(debouncedSearch);
  const { data: movies, isLoading: catalogLoading } = useCatalog('movie');

  const displayData = isSearching ? searchResults : movies;
  const isLoading = isSearching ? searchLoading : catalogLoading;

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>🎬 Streamer</Text>
          <Text style={styles.heroSubtitle}>
            Your universe of content, aggregated from the open web.
          </Text>
          <Pressable style={styles.ctaButton} onPress={() => router.push('/login')}>
            <Text style={styles.ctaText}>Get Started</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search all add-ons..."
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
        />
        {isSearching && (
          <Pressable style={styles.clearBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

      {isSearching && (
        <Text style={styles.searchHint}>
          Searching across all installed add-ons...
        </Text>
      )}

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      )}

      {displayData && displayData.length === 0 && !isLoading && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {isSearching
              ? `No results for "${debouncedSearch}"`
              : 'No content found. Install some add-ons in Settings!'}
          </Text>
        </View>
      )}

      <FlatList
        data={displayData}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await queryClient.invalidateQueries({ queryKey: isSearching ? ['search'] : ['catalog'] });
              setRefreshing(false);
            }}
            tintColor="#818cf8"
            colors={['#818cf8']}
          />
        }
        renderItem={({ item }) => <CatalogCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: '#e0e0ff',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  ctaButton: {
    backgroundColor: '#818cf8',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#818cf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a3e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#e0e0ff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.2)',
  },
  clearBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 14,
  },
  searchHint: {
    color: '#6b7280',
    fontSize: 11,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  grid: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  card: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a3e',
    maxWidth: '48%',
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: '#2a2a4e',
  },
  cardOverlay: {
    padding: 8,
  },
  cardTitle: {
    color: '#e0e0ff',
    fontWeight: '600',
    fontSize: 13,
  },
  ratingBadge: {
    marginTop: 4,
  },
  ratingText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
});
