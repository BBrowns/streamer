import {
  View,
  Text,
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
      className="flex-1 mx-1 mb-3 rounded-xl overflow-hidden bg-surface max-w-[48%]"
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
    >
      <Image source={{ uri: item.poster }} className="w-full aspect-[2/3] bg-surface/50" />
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
}

export default function HomeScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const queryClient = useQueryClient();
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

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background justify-center items-center px-8">
        <Text className="text-4xl font-extrabold text-textMain mb-3">🎬 Streamer</Text>
        <Text className="text-base text-textMuted text-center leading-6 mb-8">
          Your universe of content, aggregated from the open web.
        </Text>
        <Pressable className="bg-primary px-8 py-3.5 rounded-xl shadow-lg shadow-primary/40" onPress={() => router.push('/login')}>
          <Text className="text-white font-bold text-base">Get Started</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 py-3">
        <TextInput
          className="flex-1 bg-surface rounded-xl px-4 py-3 text-textMain text-sm border border-primary/20"
          placeholder="🔍 Search all add-ons..."
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
        />
        {isSearching && (
          <Pressable className="ml-2 w-9 h-9 rounded-full bg-error/15 justify-center items-center" onPress={() => setSearch('')}>
            <Text className="text-error font-bold text-sm">✕</Text>
          </Pressable>
        )}
      </View>

      {isSearching && (
        <Text className="text-textMuted text-[11px] px-4 mb-2">
          Searching across all installed add-ons...
        </Text>
      )}

      {isLoading && (
        <View className="flex-1 justify-center items-center p-8">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      )}

      {!!displayData && displayData.length === 0 && !isLoading && (
        <View className="flex-1 justify-center items-center p-8">
          <Text className="text-textMuted text-sm text-center">
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
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
        columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 8 }}
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
