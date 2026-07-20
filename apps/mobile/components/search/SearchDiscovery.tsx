import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { CatalogRow } from "../catalog/CatalogRow";
import { useAddons } from "../../hooks/useAddons";
import { useTheme } from "../../hooks/useTheme";
import { ContentTabs } from "../ui/ContentTabs";
import { EmptyState } from "../ui/EmptyState";
import { uiSpacing, uiTypography } from "../ui/designSystem";
import { RecentSearches } from "./RecentSearches";
import {
  buildCatalogDiscoveryRows,
  canBrowseCatalog,
  type CatalogDiscoveryType,
} from "../../services/catalogDiscovery";

type DiscoveryType = CatalogDiscoveryType;

export type SearchDiscoveryCatalogRow = {
  addon: InstalledAddon;
  catalog: CatalogDefinition;
};

const MAX_VISIBLE_CATALOG_ROWS = 6;

/**
 * The current catalog endpoint can page with `skip`, but it cannot supply
 * arbitrary required Stremio extras. Do not expose a row that is guaranteed
 * to fail before the user has made a choice the client cannot yet send.
 */
export function canBrowseCatalogFromSearch(catalog: CatalogDefinition) {
  return canBrowseCatalog(catalog);
}

export function buildSearchDiscoveryCatalogRows(
  addons: readonly InstalledAddon[] | undefined,
  type: DiscoveryType,
) {
  return buildCatalogDiscoveryRows(addons, type);
}

type SearchDiscoveryProps = {
  recentSearches: string[];
  onSelectRecentSearch: (query: string) => void;
  onRemoveRecentSearch: (query: string) => void;
  onClearRecentSearches: () => void;
  onManageAddons: () => void;
};

/**
 * Passive discovery for the empty Search route. This deliberately stays tied
 * to installed add-on catalog metadata: catalog names and providers remain
 * visible instead of applying editorial labels whose meaning an add-on never
 * declared.
 */
export function SearchDiscovery({
  recentSearches,
  onSelectRecentSearch,
  onRemoveRecentSearch,
  onClearRecentSearches,
  onManageAddons,
}: SearchDiscoveryProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: addons, isLoading, isError, refetch } = useAddons();
  const [type, setType] = useState<DiscoveryType>("all");
  const allCatalogRows = useMemo(
    () => buildSearchDiscoveryCatalogRows(addons, "all"),
    [addons],
  );
  const catalogRows = useMemo(
    () =>
      buildSearchDiscoveryCatalogRows(addons, type).slice(
        0,
        MAX_VISIBLE_CATALOG_ROWS,
      ),
    [addons, type],
  );
  const typeOptions = [
    { label: t("search.types.all"), value: "all" as const },
    { label: t("search.types.moviePlural"), value: "movie" as const },
    { label: t("search.types.seriesPlural"), value: "series" as const },
  ];

  return (
    <View testID="search-discovery" style={styles.container}>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("search.discovery.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("search.discovery.subtitle")}
        </Text>

        <View style={styles.typeControl}>
          <Text style={[styles.typeLabel, { color: colors.textSecondary }]}>
            {t("search.filters.contentType")}
          </Text>
          <ContentTabs
            testID="search-discovery-type-tabs"
            variant="underline"
            options={typeOptions}
            value={type}
            onChange={setType}
            accessibilityLabel={t("search.filters.type")}
          />
        </View>
      </View>

      {isLoading && !addons ? (
        <View
          testID="search-discovery-loading"
          accessibilityRole="progressbar"
          accessibilityLabel={t("search.discovery.title")}
          style={styles.loading}
        >
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t("search.states.errorTitle")}
          description={t("search.states.errorDescription")}
          actionLabel={t("common.retry")}
          onAction={() => void refetch()}
          fill={false}
        />
      ) : allCatalogRows.length === 0 ? (
        <EmptyState
          icon="extension-puzzle-outline"
          title={t(
            (addons?.length ?? 0) > 0
              ? "search.discovery.noBrowseableCatalogsTitle"
              : "search.discovery.noProvidersTitle",
          )}
          description={t(
            (addons?.length ?? 0) > 0
              ? "search.discovery.noBrowseableCatalogsDescription"
              : "search.discovery.noProvidersDescription",
          )}
          actionLabel={t("search.discovery.manageAddons")}
          onAction={onManageAddons}
          fill={false}
        />
      ) : catalogRows.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={t("search.discovery.noCatalogsTitle")}
          description={t("search.discovery.noCatalogsDescription")}
          actionLabel={t("search.discovery.manageAddons")}
          onAction={onManageAddons}
          fill={false}
        />
      ) : (
        <View style={styles.catalogs}>
          {catalogRows.map(({ addon, catalog }) => (
            <CatalogRow
              key={`search-${addon.id}-${catalog.type}-${catalog.id}`}
              addon={addon}
              catalog={catalog}
            />
          ))}
        </View>
      )}

      {recentSearches.length > 0 ? (
        <View style={[styles.recent, { borderTopColor: colors.border }]}>
          <RecentSearches
            items={recentSearches}
            onSelect={onSelectRecentSearch}
            onRemove={onRemoveRecentSearch}
            onClear={onClearRecentSearches}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: uiSpacing.xxl, paddingBottom: uiSpacing.xxl },
  intro: { paddingHorizontal: uiSpacing.xxl, gap: uiSpacing.sm },
  title: { ...uiTypography.title, fontSize: 26, lineHeight: 32 },
  subtitle: { ...uiTypography.body, maxWidth: 540 },
  typeControl: { marginTop: uiSpacing.md, gap: uiSpacing.xs },
  typeLabel: { ...uiTypography.label },
  loading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogs: { gap: 0 },
  recent: {
    marginHorizontal: uiSpacing.xxl,
    paddingTop: uiSpacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
