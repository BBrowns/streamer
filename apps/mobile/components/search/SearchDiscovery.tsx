import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type {
  CatalogDefinition,
  InstalledAddon,
  MetaPreview,
} from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import { useAddons } from "../../hooks/useAddons";
import { useTheme } from "../../hooks/useTheme";
import type { SearchTypeFilter } from "../../services/searchState";
import { AppButton } from "../ui/AppButton";
import { EmptyState } from "../ui/EmptyState";
import { SearchResultCard } from "./SearchResultCard";

function DiscoveryRail({
  addon,
  catalog,
}: {
  addon: InstalledAddon;
  catalog: CatalogDefinition;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useAddonCatalog(
    addon.id,
    catalog,
  );
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flat() ?? [])
      .filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [data]);

  if (isError) {
    return (
      <View
        testID={`search-discovery-rail-error-${addon.id}-${catalog.id}`}
        style={styles.rail}
      >
        <View style={styles.railHeader}>
          <Text style={[styles.railTitle, { color: colors.text }]}>
            {catalog.name}
          </Text>
          <Text style={[styles.railProvider, { color: colors.textSecondary }]}>
            {addon.manifest.name}
          </Text>
        </View>
        <View style={[styles.railFailure, { backgroundColor: colors.card }]}>
          <EmptyState
            fill={false}
            size="small"
            icon="cloud-offline-outline"
            title={t("search.discovery.catalogErrorTitle")}
            description={t("search.discovery.catalogErrorDescription")}
            actionLabel={t("common.retry")}
            onAction={() => void refetch()}
          />
        </View>
      </View>
    );
  }

  if (!isLoading && items.length === 0) return null;

  return (
    <View style={styles.rail}>
      <View style={styles.railHeader}>
        <Text style={[styles.railTitle, { color: colors.text }]}>
          {catalog.name}
        </Text>
        <Text style={[styles.railProvider, { color: colors.textSecondary }]}>
          {addon.manifest.name}
        </Text>
      </View>
      {isLoading ? (
        <View style={styles.railLoading}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : (
        <FlatList<MetaPreview>
          horizontal
          data={items}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railList}
          renderItem={({ item }) => (
            <View style={styles.railCard}>
              <SearchResultCard item={item} />
            </View>
          )}
        />
      )}
    </View>
  );
}

export function SearchDiscovery({ type }: { type: SearchTypeFilter }) {
  const { data: addons, isLoading, isError, refetch } = useAddons();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const hasInstalledAddons = (addons?.length ?? 0) > 0;
  const rows = useMemo(() => {
    const result: Array<{
      addon: InstalledAddon;
      catalog: CatalogDefinition;
    }> = [];
    [...(addons ?? [])]
      .sort((left, right) => left.installedAt.localeCompare(right.installedAt))
      .forEach((addon) => {
        addon.manifest.catalogs.forEach((catalog) => {
          if (
            (catalog.type === "movie" || catalog.type === "series") &&
            (type === "all" || catalog.type === type)
          ) {
            result.push({ addon, catalog });
          }
        });
      });
    return result;
  }, [addons, type]);

  if (isLoading) {
    return (
      <View testID="search-discovery" style={styles.discoveryLoading}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (isError) {
    return (
      <View testID="search-discovery" style={styles.discoveryError}>
        <EmptyState
          icon="cloud-offline-outline"
          title={t("search.states.errorTitle")}
          description={t("search.states.errorDescription")}
          actionLabel={t("common.retry")}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (!hasInstalledAddons) {
    return (
      <View
        testID="search-discovery"
        style={[styles.noProvider, { backgroundColor: colors.card }]}
      >
        <View
          style={[styles.providerIcon, { backgroundColor: colors.tint + "18" }]}
        >
          <Ionicons
            name="extension-puzzle-outline"
            size={24}
            color={colors.tint}
          />
        </View>
        <View style={styles.noProviderCopy}>
          <Text style={[styles.noProviderTitle, { color: colors.text }]}>
            {t("search.discovery.noProvidersTitle")}
          </Text>
          <Text
            style={[styles.noProviderBody, { color: colors.textSecondary }]}
          >
            {t("search.discovery.noProvidersDescription")}
          </Text>
        </View>
        <AppButton
          label={t("search.discovery.manageAddons")}
          icon="add"
          variant="primary"
          onPress={() => router.push("/addons")}
        />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View
        testID="search-discovery-no-catalogs"
        style={[styles.noCatalogs, { backgroundColor: colors.card }]}
      >
        <EmptyState
          fill={false}
          size="small"
          icon="albums-outline"
          title={t("search.discovery.noCatalogsTitle")}
          description={t("search.discovery.noCatalogsDescription")}
        />
      </View>
    );
  }

  return (
    <View testID="search-discovery" style={styles.discovery}>
      {rows.map(({ addon, catalog }) => (
        <DiscoveryRail
          key={`${addon.id}:${catalog.type}:${catalog.id}`}
          addon={addon}
          catalog={catalog}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  discovery: { gap: 24 },
  discoveryLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryError: { minHeight: 220, justifyContent: "center" },
  rail: { gap: 12 },
  railHeader: { paddingHorizontal: 24, gap: 2 },
  railTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  railProvider: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  railLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  railFailure: {
    minHeight: 180,
    marginHorizontal: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  railList: { paddingHorizontal: 24, gap: 14 },
  railCard: { width: 154 },
  noCatalogs: {
    minHeight: 220,
    marginHorizontal: 24,
    borderRadius: 20,
    justifyContent: "center",
  },
  noProvider: {
    marginHorizontal: 24,
    borderRadius: 20,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noProviderCopy: { flex: 1, minWidth: 220, gap: 4 },
  noProviderTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  noProviderBody: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
});
