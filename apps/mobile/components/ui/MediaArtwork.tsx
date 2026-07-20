import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage, type ImageContentFit } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTheme } from "../../hooks/useTheme";
import { uiSpacing, uiTypography } from "./designSystem";

export type MediaArtworkVariant = "poster" | "backdrop" | "logo";

type MediaArtworkProps = {
  uri?: string | null;
  variant?: MediaArtworkVariant;
  title?: string | null;
  accessibilityLabel?: string;
  accessible?: boolean;
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  testID?: string;
};

type ArtworkState = "loading" | "ready" | "fallback";
type ArtworkLoadState = { uri: string; state: ArtworkState };

function normalizeUri(uri?: string | null) {
  return typeof uri === "string" ? uri.trim() : "";
}

function fallbackIconFor(variant: MediaArtworkVariant) {
  if (variant === "backdrop") return "image-outline";
  if (variant === "logo") return "text-outline";
  return "film-outline";
}

/**
 * Shared, resilient artwork renderer for remote catalogue media.
 *
 * The primitive owns the common caching, loading and broken-image behaviour so
 * cards and detail layouts do not each have to infer whether a provider URL is
 * usable. It intentionally renders a quiet, token-based fallback instead of a
 * provider-specific placeholder image.
 */
export function MediaArtwork({
  uri,
  variant = "poster",
  title,
  accessibilityLabel,
  accessible,
  contentFit = "cover",
  style,
  imageStyle,
  testID,
}: MediaArtworkProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const sourceUri = normalizeUri(uri);
  const [loadState, setLoadState] = useState<ArtworkLoadState>(() => ({
    uri: sourceUri,
    state: sourceUri ? "loading" : "fallback",
  }));

  useEffect(() => {
    setLoadState({
      uri: sourceUri,
      state: sourceUri ? "loading" : "fallback",
    });
  }, [sourceUri]);

  // Derive the new source's state synchronously so a recycled card never
  // briefly shows the former image while the effect above catches up.
  const state =
    loadState.uri === sourceUri
      ? loadState.state
      : sourceUri
        ? "loading"
        : "fallback";

  const imageAccessibilityLabel =
    accessibilityLabel ?? (title ? `${title} ${variant}` : undefined);
  const shouldExposeImage = accessible ?? Boolean(imageAccessibilityLabel);
  const fallbackTitle = variant === "poster" ? title?.trim() : undefined;
  const recyclingKey = useMemo(
    () => (sourceUri ? `${variant}:${sourceUri}` : null),
    [sourceUri, variant],
  );

  return (
    <View
      testID={testID}
      style={[styles.frame, { backgroundColor: colors.surfaceElevated }, style]}
    >
      {state !== "fallback" && sourceUri ? (
        <ExpoImage
          source={{ uri: sourceUri }}
          style={[styles.image, imageStyle]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey}
          transition={reducedMotion ? 0 : 180}
          accessibilityLabel={imageAccessibilityLabel}
          accessible={shouldExposeImage}
          onLoad={() => {
            setLoadState((current) =>
              current.uri === sourceUri
                ? { ...current, state: "ready" }
                : current,
            );
          }}
          onLoadEnd={() => {
            setLoadState((current) =>
              current.uri === sourceUri && current.state === "loading"
                ? { ...current, state: "ready" }
                : current,
            );
          }}
          onError={() => {
            setLoadState((current) =>
              current.uri === sourceUri
                ? { ...current, state: "fallback" }
                : current,
            );
          }}
          testID={testID ? `${testID}-image` : undefined}
        />
      ) : null}

      {state === "loading" ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={testID ? `${testID}-skeleton` : undefined}
          style={[
            styles.skeleton,
            {
              backgroundColor: colors.surfaceSubtle,
              opacity: reducedMotion ? 1 : 0.82,
            },
          ]}
        >
          <View
            style={[
              styles.skeletonHighlight,
              { backgroundColor: colors.card + "8C" },
            ]}
          />
        </View>
      ) : null}

      {state === "fallback" ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden={!shouldExposeImage}
          importantForAccessibility={
            shouldExposeImage ? "auto" : "no-hide-descendants"
          }
          accessibilityLabel={imageAccessibilityLabel}
          testID={testID ? `${testID}-fallback` : undefined}
          style={styles.fallback}
        >
          <Ionicons
            name={fallbackIconFor(variant)}
            size={variant === "poster" ? 28 : 32}
            color={colors.tint}
          />
          {fallbackTitle ? (
            <Text
              numberOfLines={3}
              style={[styles.fallbackTitle, { color: colors.textSecondary }]}
            >
              {fallbackTitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  skeletonHighlight: {
    width: "46%",
    height: "100%",
    alignSelf: "center",
    opacity: 0.46,
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: uiSpacing.md,
    padding: uiSpacing.lg,
  },
  fallbackTitle: {
    ...uiTypography.label,
    textAlign: "center",
  },
});
