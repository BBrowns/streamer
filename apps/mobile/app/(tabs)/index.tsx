import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  TextInput,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, memo } from 'react';
import { useCatalog } from '../../hooks/useCatalog';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { useAuthStore } from '../../stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import type { MetaPreview } from '@streamer/shared';
import { SkeletonCardGrid } from '../../components/ui/SkeletonLoader';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { OfflineBanner } from '../../components/ui/OfflineBanner';

/** Responsive column count based on screen width */
function useResponsiveColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1280) return 6;   // Desktop wide
  if (width >= 1024) return 5;   // Desktop
  if (width >= 768) return 4;    // Tablet
  if (width >= 480) return 3;    // Large phone / landscape
  return 2;                       // Phone portrait
}

const CatalogCard = memo(function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Pressable
      style={{ flex: 1, marginHorizontal: 4, marginBottom: 12 }}
      className="rounded-xl overflow-hidden bg-surface"
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ''}`}
      accessibilityHint="Opens details page"
    >
      <Image
        source={{ uri: item.poster }}
        className="w-full aspect-[2/3] bg-surface/50"
        accessibilityIgnoresInvertColors
      />
      <View className="p-2">
        <Text className="text-textMain font-semibold text-[13px]" numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <View className="mt-1">
            <Text className="text-amber-400 text-[11px] font-semibold">⭐ {item.imdbRating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

function HomeContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const numColumns = useResponsiveColumns();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const isSearching = debouncedSearch.length >= 2;

  const { data: searchResults, isLoading: searchLoading } = useGlobalSearch(debouncedSearch);
  const { data: movies, isLoading: catalogLoading } = useCatalog('movie');

  const displayData = isSearching ? searchResults : movies;
  const isLoading = isSearching ? searchLoading : catalogLoading;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: isSearching ? ['search'] : ['catalog'] });
    setRefreshing(false);
  }, [queryClient, isSearching]);

  // Wait for auth hydration to prevent flash of unauthenticated UI
  if (!isHydrated) {
    return (
      <View className="flex-1 bg-background">
        <SkeletonCardGrid count={6} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background justify-center items-center px-8">
        <Text
          className="text-4xl font-extrabold text-textMain mb-3"
          accessibilityRole="header"
        >
          🎬 Streamer
        </Text>
        <Text className="text-base text-textMuted text-center leading-6 mb-8">
          Your universe of content, aggregated from the open web.
        </Text>
        <Pressable
          className="bg-primary px-8 py-3.5 rounded-xl shadow-lg shadow-primary/40"
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          accessibilityLabel="Get started and sign in"
        >
          <Text className="text-white font-bold text-base">Get Started</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />

      {/* Search Bar */}
      <View className="flex-row items-center px-4 py-3">
        <TextInput
          className="flex-1 bg-surface rounded-xl px-4 py-3 text-textMain text-sm border border-primary/20"
          placeholder="🔍 Search all add-ons..."
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search all add-ons"
          accessibilityHint="Type at least 2 characters to search"
          returnKeyType="search"
        />
        {isSearching && (
          <Pressable
            className="ml-2 w-9 h-9 rounded-full bg-error/15 justify-center items-center"
            onPress={() => setSearch('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text className="text-error font-bold text-sm">✕</Text>
          </Pressable>
        )}
      </View>

      {isSearching && (
        <Text className="text-textMuted text-[11px] px-4 mb-2">
          Searching across all installed add-ons...
        </Text>
      )}

      {/* Loading: Skeleton grid */}
      {isLoading && <SkeletonCardGrid count={numColumns * 3} />}

      {/* Empty state */}
      {!!displayData && displayData.length === 0 && !isLoading && (
        <EmptyState
          emoji={isSearching ? '🔍' : '📦'}
          title={isSearching ? 'No Results' : 'No Content Found'}
          description={
            isSearching
              ? `No results for "${debouncedSearch}"`
              : 'Install some add-ons in Settings to start browsing.'
          }
          actionLabel={isSearching ? undefined : 'Manage Add-ons'}
          onAction={isSearching ? undefined : () => router.push('/addons')}
        />
      )}

      {/* Content grid */}
      {!isLoading && displayData && displayData.length > 0 && (
        <FlatList
          data={displayData}
          keyExtractor={(item) => item.id}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#818cf8"
              colors={['#818cf8']}
            />
          }
          renderItem={({ item }) => <CatalogCard item={item} />}
          initialNumToRender={numColumns * 3}
          maxToRenderPerBatch={numColumns * 2}
          windowSize={5}
        />
      )}
    </View>
  );
}

export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}
