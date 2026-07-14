import React, { memo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { CatalogItemCard } from "./CatalogItemCard";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { useWindowClass } from "../../hooks/useWindowClass";
import { useTranslation } from "react-i18next";
import {
  getWebFocusStyle,
  uiRadii,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

const CARD_WIDTH_MOBILE = 140;
const CARD_WIDTH_DESKTOP = 200;
const CARD_GAP = 12;

function CatalogRowInner({
  catalog,
  addon,
  excludeContentKeys,
}: {
  catalog: CatalogDefinition;
  addon: InstalledAddon;
  excludeContentKeys?: ReadonlySet<string>;
}) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useAddonCatalog(addon.id, catalog);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isExpanded, isLarge } = useWindowClass();
  const isDesktop = isExpanded || isLarge;
  const flatListRef = useRef<FlatList>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const cardWidth = isDesktop ? CARD_WIDTH_DESKTOP : CARD_WIDTH_MOBILE;
  const scrollAmount = cardWidth * 3 + CARD_GAP * 3; // scroll 3 cards at a time

  const scrollLeft = () => {
    const newOffset = Math.max(0, scrollOffset - scrollAmount);
    flatListRef.current?.scrollToOffset({ offset: newOffset, animated: true });
  };

  const scrollRight = () => {
    const newOffset = scrollOffset + scrollAmount;
    flatListRef.current?.scrollToOffset({ offset: newOffset, animated: true });
  };

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

  if (isLoading) {
    return (
      <View style={styles.rowContainer}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          {catalog.name}
        </Text>
        <ActivityIndicator color={colors.tint} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  if (flattenedData.length === 0) return null;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.rowHeader}>
        <View style={styles.rowTitleRow}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {catalog.name}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            {addon.manifest.name}
          </Text>
        </View>

        {/* Desktop scroll arrows */}
        {isDesktop && (
          <View style={styles.scrollArrows}>
            <Pressable
              style={({ pressed, hovered, focused }: any) => [
                styles.arrowBtn,
                {
                  backgroundColor: colors.surfaceElevated,
                },
                hovered && {
                  backgroundColor: colors.surfaceElevated,
                },
                pressed && { opacity: 0.7 },
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
              onPress={scrollLeft}
              accessibilityRole="button"
              accessibilityLabel={t("catalog.scrollLeft")}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
            <Pressable
              style={({ pressed, hovered, focused }: any) => [
                styles.arrowBtn,
                {
                  backgroundColor: colors.surfaceElevated,
                },
                hovered && {
                  backgroundColor: colors.surfaceElevated,
                },
                pressed && { opacity: 0.7 },
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
              onPress={scrollRight}
              accessibilityRole="button"
              accessibilityLabel={t("catalog.scrollRight")}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        horizontal
        data={flattenedData}
        keyExtractor={(item) =>
          `${addon.id}-${catalog.type}-${catalog.id}-${item.type}:${item.id}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.rowScroll,
          isDesktop && styles.rowScrollDesktop,
        ]}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <CatalogItemCard item={item} />
          </View>
        )}
        onScroll={(e) => setScrollOffset(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.tint} style={{ marginLeft: 20 }} />
          ) : null
        }
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
  rowTitleRow: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...uiTypography.title,
    fontSize: 20,
    lineHeight: 26,
  },
  rowSubtitle: {
    ...uiTypography.caption,
  },
  scrollArrows: {
    flexDirection: "row",
    gap: 8,
  },
  arrowBtn: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore web-only
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  } as any,
  rowScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  rowScrollDesktop: {
    gap: CARD_GAP,
  },
});
