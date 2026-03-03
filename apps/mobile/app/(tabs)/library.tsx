import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../stores/authStore";
import { useLibrary, useRemoveFromLibrary } from "../../hooks/useLibrary";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import type { LibraryItem } from "@streamer/shared";

function LibraryCard({
  item,
  onRemove,
}: {
  item: LibraryItem;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <Pressable
      className="flex-1 rounded-xl overflow-hidden bg-surface min-h-[44px]"
      onPress={() => router.push(`/detail/${item.type}/${item.itemId}`)}
      onLongPress={() => onRemove(item.itemId)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Long press to remove from library`}
      accessibilityHint="Opens detail page"
    >
      <Image
        source={{ uri: item.poster ?? undefined }}
        className="w-full aspect-[2/3] bg-surface/50"
        accessibilityLabel={`${item.title} poster`}
      />
      <View className="p-2">
        <Text
          className="text-textMain text-[13px] font-semibold"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <Text className="text-textMuted text-[11px] mt-1">
          {item.type === "movie" ? "🎬 Movie" : "📺 Series"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useLibrary();
  const removeFromLibrary = useRemoveFromLibrary();
  const [refreshing, setRefreshing] = useState(false);

  const handleRemove = useCallback(
    (itemId: string) => {
      removeFromLibrary.mutate(itemId);
    },
    [removeFromLibrary],
  );

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-8">
        <Text className="text-5xl mb-3">📚</Text>
        <Text className="text-textMain text-lg font-bold mb-2">
          Your Library
        </Text>
        <Text className="text-textMuted text-sm text-center mb-5 leading-5">
          Sign in to access your watchlist
        </Text>
        <Pressable
          className="bg-primary px-6 py-3 rounded-xl min-w-[44px] min-h-[44px]"
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Text className="text-white font-bold text-[15px]">Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-8">
        <ActivityIndicator size="large" color="#818cf8" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{
          paddingHorizontal: 12,
          gap: 10,
          marginBottom: 10,
        }}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={<ContinueWatchingRow />}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center pt-16 px-8">
            <Text className="text-5xl mb-3">📭</Text>
            <Text className="text-textMain text-lg font-bold mb-2">
              No Items Yet
            </Text>
            <Text className="text-textMuted text-sm text-center leading-5">
              Browse the Discover tab and add movies & shows to your library.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await queryClient.invalidateQueries({ queryKey: ["library"] });
              await queryClient.invalidateQueries({ queryKey: ["progress"] });
              setRefreshing(false);
            }}
            tintColor="#818cf8"
            colors={["#818cf8"]}
          />
        }
        renderItem={({ item }) => (
          <LibraryCard item={item} onRemove={handleRemove} />
        )}
      />
    </View>
  );
}
