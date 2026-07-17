import React, { memo, useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { useTranslation } from "react-i18next";
import type { SearchMetaPreview } from "../../hooks/useSearch";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { getWebFocusStyle } from "../ui/designSystem";

type SearchCardItem = MetaPreview | SearchMetaPreview;

function releaseYear(item: SearchCardItem) {
  const value = item.releaseInfo ?? item.released ?? "";
  return value.match(/\b(19|20)\d{2}\b/)?.[0];
}

function providerCount(item: SearchCardItem) {
  return "providerIds" in item ? item.providerIds.length : 0;
}

function SearchResultCardInner({
  item,
  onPress,
  compact = false,
}: {
  item: SearchCardItem;
  onPress?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const posterUri = typeof item.poster === "string" ? item.poster.trim() : "";
  const [imageFailed, setImageFailed] = useState(!posterUri);

  useEffect(() => setImageFailed(!posterUri), [item.id, posterUri]);

  const openDetail = useCallback(() => {
    if (onPress) onPress();
    else router.push(`/detail/${item.type}/${item.id}`);
  }, [item.id, item.type, onPress, router]);
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(openDetail);

  const year = releaseYear(item);
  const sources = providerCount(item);
  const accessibilityLabel = [
    item.name,
    t(`search.types.${item.type}`),
    year,
    item.imdbRating,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      {...webPressableProps}
      testID={`search-result-${item.type}-${item.id}`}
      onPress={openDetail}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t("search.a11y.openDetails")}
      style={({ pressed, hovered }: any) => [
        styles.card,
        !reducedMotion && styles.animatedCard,
        compact && styles.compactCard,
        Platform.OS === "web" && hovered && !reducedMotion && styles.hovered,
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
        pressed && { opacity: 0.76 },
      ]}
    >
      <View
        style={[
          styles.posterWrap,
          compact && styles.compactPosterWrap,
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        {!imageFailed && posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={reducedMotion ? 0 : 160}
            recyclingKey={`${item.type}:${item.id}:${posterUri}`}
            accessibilityLabel={t("search.a11y.poster", { title: item.name })}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.posterFallback}>
            <Ionicons
              name={item.type === "movie" ? "film-outline" : "tv-outline"}
              size={compact ? 20 : 28}
              color={colors.textSecondary}
            />
          </View>
        )}
      </View>

      <View style={[styles.copy, compact && styles.compactCopy]}>
        <Text
          style={[
            styles.title,
            compact && styles.compactTitle,
            { color: colors.text },
          ]}
          numberOfLines={compact ? 1 : 2}
        >
          {item.name}
        </Text>
        <View style={styles.metadata}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {t(`search.types.${item.type}`)}
          </Text>
          {!!year && (
            <>
              <Text style={[styles.dot, { color: colors.textSecondary }]}>
                ·
              </Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {year}
              </Text>
            </>
          )}
          {!!item.imdbRating && (
            <>
              <Text style={[styles.dot, { color: colors.textSecondary }]}>
                ·
              </Text>
              <Text style={[styles.rating, { color: colors.warning }]}>
                {item.imdbRating}
              </Text>
            </>
          )}
        </View>
        {!compact && sources > 0 && (
          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>
            {t("search.results.sources", { count: sources })}
          </Text>
        )}
      </View>
      {compact && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={isDark ? colors.textSecondary : colors.text}
        />
      )}
    </Pressable>
  );
}

export const SearchResultCard = memo(SearchResultCardInner);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    borderRadius: 12,
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  animatedCard: {
    // @ts-ignore web-only
    transition: "transform 140ms ease, opacity 140ms ease",
  } as any,
  hovered: { transform: [{ translateY: -3 }] },
  compactCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 12,
  },
  posterWrap: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactPosterWrap: {
    width: 40,
    height: 60,
    aspectRatio: undefined,
    borderRadius: 8,
  },
  poster: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  copy: { gap: 4 },
  compactCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  compactTitle: { fontSize: 14, lineHeight: 18 },
  metadata: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  metaText: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  dot: { marginHorizontal: 5, fontSize: 11 },
  rating: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  sourceText: { fontSize: 11, lineHeight: 15, fontWeight: "500" },
});
