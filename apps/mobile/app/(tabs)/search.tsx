import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSearch } from "../../hooks/useSearch";
import { useSearchStore } from "../../stores/searchStore";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import type { MetaPreview } from "@streamer/shared";

/** Responsive column count based on screen width (copied from index.tsx for consistency) */
function useResponsiveColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 480) return 3;
  return 2;
}

const SearchCard = React.memo(function SearchCard({
  item,
}: {
  item: MetaPreview;
}) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
    >
      <Image source={{ uri: item.poster }} style={styles.cardImage} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#ffd600" />
            <Text style={styles.ratingText}>{item.imdbRating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

function SearchContent() {
  const { query, setQuery } = useSearchStore();
  const { data: results, isLoading } = useSearch(query);
  const numColumns = useResponsiveColumns();
  const router = useRouter();

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Search" }} />

      {!isDesktop && (
        <View style={styles.searchBarContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#94a3b8"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Search movies & shows..."
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
            accessibilityLabel="Search input"
          />
        </View>
      )}

      {isLoading && <SkeletonCardGrid count={numColumns * 2} />}

      {!isLoading && results && results.length > 0 ? (
        <FlatList
          key={`search-grid-${numColumns}`}
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <SearchCard item={item} />}
        />
      ) : (
        !isLoading &&
        query.length > 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#1e293b" />
            <Text style={styles.emptyTitle}>No results for "{query}"</Text>
            <Text style={styles.emptySubtitle}>
              Try searching for something else
            </Text>
          </View>
        )
      )}

      {!isLoading && query.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={64} color="#1e293b" />
          <Text style={styles.emptyTitle}>Discover something new</Text>
          <Text style={styles.emptySubtitle}>
            Search for movies, TV shows and more
          </Text>
        </View>
      )}
    </View>
  );
}

export default function SearchScreen() {
  return (
    <ErrorBoundary>
      <SearchContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010101" },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080808",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  searchIcon: { marginRight: 8 },
  input: {
    flex: 1,
    height: 48,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContent: { paddingHorizontal: 8, paddingBottom: 20 },
  cardContainer: {
    flex: 1,
    marginHorizontal: 6,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: { color: "#ffffff", fontWeight: "800", fontSize: 13 },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  ratingText: {
    color: "#ffd600",
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    opacity: 0.5,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptySubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
