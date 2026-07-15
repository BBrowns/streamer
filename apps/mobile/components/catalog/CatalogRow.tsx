import React, { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { MediaRail } from "../ui/MediaRail";
import { getWebFocusStyle, uiSpacing, uiTypography } from "../ui/designSystem";
import { CatalogItemCard } from "./CatalogItemCard";

const CARD_WIDTH_MOBILE = 140;
const CARD_WIDTH_DESKTOP = 200;

function CatalogRowInner({
  catalog,
  addon,
  excludeContentKeys,
}: {
  catalog: CatalogDefinition;
  addon: InstalledAddon;
  excludeContentKeys?: ReadonlySet<string>;
}) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAddonCatalog(addon.id, catalog);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isExpanded, isLarge } = useWindowClass();
  const cardWidth =
    isExpanded || isLarge ? CARD_WIDTH_DESKTOP : CARD_WIDTH_MOBILE;

  const flattenedData = (data?.pages.flat() || []).filter(
    (item, index, items) => {
      const key = `${item.type}:${item.id}`;
      return (
        !excludeContentKeys?.has(key) &&
        items.findIndex(
          (candidate) => `${candidate.type}:${candidate.id}` === key,
        ) === index
      );
    },
  );

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorCopy}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {catalog.name}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            {t("search.discovery.inlineCatalogError", {
              defaultValue: "{{provider}} could not load this catalog.",
              provider: addon.manifest.name,
            })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
          onPress={() => void refetch()}
          style={({ pressed, focused }: any) => [
            styles.retry,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
        >
          <Text style={[styles.retryText, { color: colors.tint }]}>
            {t("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!isLoading && flattenedData.length === 0) return null;

  return (
    <MediaRail
      testID={`catalog-rail-${addon.id}-${catalog.type}-${catalog.id}`}
      style={styles.rowContainer}
      title={catalog.name}
      subtitle={addon.manifest.name}
      data={flattenedData}
      loading={isLoading}
      cardWidth={cardWidth}
      keyExtractor={(item) =>
        `${addon.id}-${catalog.type}-${catalog.id}-${item.type}:${item.id}`
      }
      renderItem={(item) => <CatalogItemCard item={item} />}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      isFetchingNextPage={isFetchingNextPage}
    />
  );
}

export const CatalogRow = memo(CatalogRowInner);

const styles = StyleSheet.create({
  rowContainer: { marginBottom: 28 },
  errorContainer: {
    minHeight: 56,
    marginHorizontal: uiSpacing.lg,
    marginBottom: uiSpacing.xxl,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.lg,
  },
  errorCopy: { flex: 1, minWidth: 0 },
  errorTitle: { ...uiTypography.label },
  errorMessage: { ...uiTypography.caption, marginTop: 2 },
  retry: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: uiSpacing.sm,
  },
  retryText: { ...uiTypography.control },
  pressed: { opacity: 0.7 },
});
