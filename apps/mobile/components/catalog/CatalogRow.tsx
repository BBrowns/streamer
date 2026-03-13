import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type {
  MetaPreview,
  CatalogDefinition,
  InstalledAddon,
} from "@streamer/shared";

function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.poster}
        accessibilityLabel={`${item.name} poster`}
      />
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.name}
      </Text>
      {!!item.imdbRating && (
        <Text style={styles.rating}>⭐ {item.imdbRating}</Text>
      )}
    </Pressable>
  );
}

const MemoizedCard = memo(CatalogCard);

/** A single horizontal row for one catalog — extracted and memoized */
function CatalogRowInner({
  catalog,
  addon,
}: {
  catalog: CatalogDefinition;
  addon: InstalledAddon;
}) {
  const { data, isLoading } = useAddonCatalog(catalog.type);

  if (isLoading) {
    return (
      <View style={styles.rowContainer}>
        <Text style={styles.rowTitle}>{catalog.name}</Text>
        <ActivityIndicator color="#00f2ff" style={{ marginVertical: 20 }} />
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{catalog.name}</Text>
        <Text style={styles.rowSource}>{addon.manifest.name}</Text>
      </View>
      <FlatList
        horizontal
        data={data.slice(0, 20)}
        keyExtractor={(item) =>
          `${addon.id}-${catalog.type}-${catalog.id}-${item.id}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScroll}
        renderItem={({ item }) => <MemoizedCard item={item} />}
      />
    </View>
  );
}

export const CatalogRow = memo(CatalogRowInner);

const styles = StyleSheet.create({
  rowContainer: {
    marginBottom: 28,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rowTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  rowSource: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "600",
  },
  rowScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 140,
    borderRadius: 16,
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  poster: {
    width: 140,
    height: 210,
    backgroundColor: "#121212",
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 2,
    letterSpacing: -0.2,
  },
  rating: {
    color: "#ffd600",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});
