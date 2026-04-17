import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSearch } from "../../hooks/useSearch";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { hapticImpactLight } from "../../lib/haptics";

export default function SearchResultsScreen() {
  const { q } = useLocalSearchParams<{ q: string }>();
  const router = useRouter();
  const numColumns = useResponsiveColumns();
  const { data, isLoading } = useSearch(q || "");

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `Results for "${q}"`,
          headerShown: true,
          headerStyle: { backgroundColor: "#010101" },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "800" },
          headerLeft: () => (
            <Pressable
              onPress={() => {
                hapticImpactLight();
                router.back();
              }}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="chevron-back" size={28} color="#ffffff" />
            </Pressable>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.listContent}>
          <SkeletonCardGrid count={12} />
        </View>
      ) : data && data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          key={`search-grid-${numColumns}`}
          numColumns={numColumns}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          renderItem={({ item }) => <CatalogItemCard item={item} />}
        />
      ) : (
        <EmptyState
          icon="search"
          title="No Results Found"
          description={`We couldn't find anything matching "${q}". Try a different keyword or check your add-ons.`}
          actionLabel="Try Again"
          onAction={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  installBtn: {
    paddingHorizontal: 20,
    borderRadius: 10,
    justifyContent: "center",
    minWidth: 80,
    alignItems: "center",
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    padding: 8,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
});
