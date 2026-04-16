import React, { memo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type {
  MetaPreview,
  CatalogDefinition,
  InstalledAddon,
} from "@streamer/shared";
import { CatalogItemCard } from "./CatalogItemCard";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

const CARD_WIDTH_MOBILE = 140;
const CARD_WIDTH_DESKTOP = 200;
const CARD_GAP = 12;

function CatalogRowInner({
  catalog,
  addon,
}: {
  catalog: CatalogDefinition;
  addon: InstalledAddon;
}) {
  const { data, isLoading } = useAddonCatalog(catalog.type);
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
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

  if (!data || data.length === 0) return null;

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
              style={({ pressed, hovered }: any) => [
                styles.arrowBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
                  borderColor: colors.border,
                },
                hovered && {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.1)",
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={scrollLeft}
              accessibilityLabel="Scroll left"
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
            <Pressable
              style={({ pressed, hovered }: any) => [
                styles.arrowBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
                  borderColor: colors.border,
                },
                hovered && {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.1)",
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={scrollRight}
              accessibilityLabel="Scroll right"
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
        data={data.slice(0, 20)}
        keyExtractor={(item) =>
          `${addon.id}-${catalog.type}-${catalog.id}-${item.id}`
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
    fontSize: 18,
    fontWeight: "800",
  },
  rowSubtitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  scrollArrows: {
    flexDirection: "row",
    gap: 8,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
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
