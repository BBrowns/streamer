import React, { type ReactNode, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWindowClass } from "../../hooks/useWindowClass";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "./designSystem";

type MediaRailProps<Item> = {
  data: readonly Item[];
  keyExtractor: (item: Item, index: number) => string;
  renderItem: (item: Item, index: number) => ReactNode;
  cardWidth: number;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  headerAction?: ReactNode;
  gap?: number;
  contentPadding?: number;
  loading?: boolean;
  loadingContent?: ReactNode;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  fadeColor?: string;
};

const EDGE_EPSILON = 2;

export function getBoundedRailOffset(
  requestedOffset: number,
  contentWidth: number,
  viewportWidth: number,
) {
  const maxOffset = Math.max(0, contentWidth - viewportWidth);
  return Math.max(0, Math.min(maxOffset, requestedOffset));
}

export function getRailEdgeState(
  offset: number,
  contentWidth: number,
  viewportWidth: number,
) {
  const boundedOffset = getBoundedRailOffset(
    offset,
    contentWidth,
    viewportWidth,
  );
  const maxOffset = Math.max(0, contentWidth - viewportWidth);
  return {
    offset: boundedOffset,
    maxOffset,
    canScrollBack: boundedOffset > EDGE_EPSILON,
    canScrollForward: maxOffset - boundedOffset > EDGE_EPSILON,
  };
}

export function getRailScrollOptions(offset: number, reducedMotion: boolean) {
  return { offset, animated: !reducedMotion };
}

/**
 * Shared, bounded horizontal media navigation for Home, Search and provider
 * catalogs. It owns end spacing, desktop controls and edge affordances so
 * every catalog behaves the same way.
 */
export function MediaRail<Item>({
  data,
  keyExtractor,
  renderItem,
  cardWidth,
  title,
  subtitle,
  eyebrow,
  headerAction,
  gap = uiSpacing.md,
  contentPadding = uiSpacing.lg,
  loading = false,
  loadingContent,
  onEndReached,
  isFetchingNextPage = false,
  testID,
  accessibilityLabel,
  style,
  fadeColor,
}: MediaRailProps<Item>) {
  const listRef = useRef<FlatList<Item>>(null);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { isExpanded, isLarge } = useWindowClass();
  const isDesktop = isExpanded || isLarge;
  const [offset, setOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const { maxOffset, canScrollBack, canScrollForward } = getRailEdgeState(
    offset,
    contentWidth,
    viewportWidth,
  );
  const edgeColor = fadeColor ?? colors.background;
  const step = useMemo(() => {
    const threeCards = (cardWidth + gap) * 3;
    return Math.max(
      cardWidth + gap,
      Math.min(threeCards, viewportWidth * 0.82),
    );
  }, [cardWidth, gap, viewportWidth]);

  const scrollTo = (nextOffset: number) => {
    const boundedOffset = getBoundedRailOffset(
      nextOffset,
      contentWidth,
      viewportWidth,
    );
    listRef.current?.scrollToOffset(
      getRailScrollOptions(boundedOffset, reducedMotion),
    );
    setOffset(boundedOffset);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextOffset = event.nativeEvent.contentOffset.x;
    setOffset(getBoundedRailOffset(nextOffset, contentWidth, viewportWidth));
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setViewportWidth(nextWidth);
    setOffset((current) =>
      Math.min(current, Math.max(0, contentWidth - nextWidth)),
    );
  };

  const hasHeading = Boolean(title || subtitle || eyebrow || headerAction);

  return (
    <View testID={testID} style={[styles.container, style]}>
      {hasHeading ? (
        <View style={[styles.header, { paddingHorizontal: contentPadding }]}>
          <View style={styles.headingCopy}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { color: colors.tint }]}>
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerActions}>
            {headerAction}
            {isDesktop ? (
              <View style={styles.arrows}>
                <RailArrow
                  direction="back"
                  disabled={!canScrollBack}
                  label={t("catalog.scrollLeft")}
                  onPress={() => scrollTo(offset - step)}
                />
                <RailArrow
                  direction="forward"
                  disabled={!canScrollForward}
                  label={t("catalog.scrollRight")}
                  onPress={() => scrollTo(offset + step)}
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {loading ? (
        (loadingContent ?? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ))
      ) : (
        <View style={styles.viewport} onLayout={handleLayout}>
          <FlatList<Item>
            ref={listRef}
            horizontal
            data={data as Item[]}
            keyExtractor={keyExtractor}
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={accessibilityLabel ?? title}
            contentContainerStyle={{
              paddingLeft: contentPadding,
              paddingRight: contentPadding,
            }}
            ItemSeparatorComponent={() => <View style={{ width: gap }} />}
            renderItem={({ item, index }) => (
              <View style={{ width: cardWidth }}>
                {renderItem(item, index)}
              </View>
            )}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={(width) => {
              setContentWidth(width);
              setOffset((current) =>
                Math.min(current, Math.max(0, width - viewportWidth)),
              );
            }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.fetchingMore}>
                  <ActivityIndicator color={colors.tint} />
                </View>
              ) : null
            }
          />

          {canScrollBack ? (
            <LinearGradient
              pointerEvents="none"
              colors={[edgeColor, edgeColor + "00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fade, styles.fadeStart]}
            />
          ) : null}
          {canScrollForward ? (
            <LinearGradient
              pointerEvents="none"
              colors={[edgeColor + "00", edgeColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fade, styles.fadeEnd]}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function RailArrow({
  direction,
  disabled,
  label,
  onPress,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed, hovered, focused }: any) => [
        styles.arrow,
        { backgroundColor: colors.surfaceElevated },
        hovered && !disabled && { backgroundColor: colors.card },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        Platform.OS === "web" &&
          focused &&
          !disabled &&
          getWebFocusStyle(colors.focus),
      ]}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={17}
        color={disabled ? colors.disabled : colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: uiSpacing.md },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: uiSpacing.lg,
  },
  headingCopy: { flex: 1, minWidth: 0, gap: uiSpacing.xxs },
  eyebrow: {
    ...uiTypography.sectionLabel,
    fontSize: 10,
    textTransform: "uppercase",
  },
  title: { ...uiTypography.title, fontSize: 20, lineHeight: 26 },
  subtitle: { ...uiTypography.caption },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  arrows: { flexDirection: "row", gap: uiSpacing.sm },
  arrow: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.7 },
  viewport: { position: "relative" },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  fetchingMore: {
    width: 64,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  fade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 30,
  },
  fadeStart: { left: 0 },
  fadeEnd: { right: 0 },
});
