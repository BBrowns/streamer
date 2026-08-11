import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";

type BrandIllustrationProps = {
  source: ImageSourcePropType;
  contentFit?: "cover" | "contain";
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

/** Local, bundled artwork contract for auth and onboarding surfaces. */
export function BrandIllustration({
  source,
  contentFit = "cover",
  accessible,
  accessibilityLabel,
  testID,
  style,
  imageStyle,
}: BrandIllustrationProps) {
  return (
    <View testID={testID} style={[styles.frame, style]}>
      <Image
        source={source}
        style={[styles.image, imageStyle]}
        resizeMode={contentFit}
        accessible={accessible ?? Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
