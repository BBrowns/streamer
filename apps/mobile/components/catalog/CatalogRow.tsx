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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import {
  MetaPreview,
  CatalogDefinition,
  InstalledAddon,
} from "@streamer/shared";
import { Card } from "../ui/Card";
import { Typography } from "../ui/Typography";
import { Theme } from "../../constants/DesignSystem";

function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Card
      title={item.name}
      subtitle={item.imdbRating ? `⭐ ${item.imdbRating}` : undefined}
      image={item.poster}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      style={styles.card}
    />
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
  const { data, isLoading } = useAddonCatalog(catalog.type, catalog.id);

  if (isLoading) {
    return (
      <View style={styles.rowContainer}>
        <Typography
          variant="h3"
          style={{ paddingHorizontal: 16, marginBottom: 12 }}
        >
          {catalog.name}
        </Typography>
        <ActivityIndicator
          color={Theme.colors.primary}
          style={{ marginVertical: 20 }}
        />
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.rowHeader}>
        <Typography variant="h3">{catalog.name}</Typography>
        <Typography
          variant="caption"
          color={Theme.colors.textMuted}
          weight="700"
        >
          {addon.manifest.name}
        </Typography>
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
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rowScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 140,
  },
});
