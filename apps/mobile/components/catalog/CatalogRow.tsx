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
import { CatalogItemCard } from "./CatalogItemCard";
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
        renderItem={({ item }) => <CatalogItemCard item={item} />}
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
});
