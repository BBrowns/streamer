import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image,
  Pressable,
  ImageSourcePropType,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolate,
  SharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import * as Haptics from "expo-haptics";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getWebFocusStyle, uiTouchTarget } from "./designSystem";
import { useWindowClass } from "../../hooks/useWindowClass";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

interface OnboardingCarouselProps {
  steps: OnboardingStep[];
  onComplete: () => void;
}

interface OnboardingItemProps {
  item: OnboardingStep;
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  padding: number;
  isDesktop: boolean;
}

function OnboardingItem({
  item,
  index,
  scrollX,
  width,
  padding,
  isDesktop,
}: OnboardingItemProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const STEP_WIDTH = width;
  const inputRange = [
    (index - 1) * STEP_WIDTH,
    index * STEP_WIDTH,
    (index + 1) * STEP_WIDTH,
  ];

  // Parallax background effect for the image container
  const animatedImageStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.6, 1.1, 0.6],
      Extrapolate.CLAMP,
    );
    const rotate = interpolate(
      scrollX.value,
      inputRange,
      [-15, 0, 15],
      Extrapolate.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolate.CLAMP,
    );
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [width * 0.4, 0, -width * 0.4],
      Extrapolate.CLAMP,
    );

    return {
      transform: [{ scale }, { rotate: `${rotate}deg` }, { translateX }],
      opacity,
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const translateY = interpolate(
      scrollX.value,
      inputRange,
      [100, 0, 100],
      Extrapolate.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolate.CLAMP,
    );
    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  return (
    <View style={[styles.stepContainer, { width: STEP_WIDTH, padding }]}>
      <Animated.View
        style={[
          styles.imageContainer,
          {
            height: isDesktop
              ? Math.min(width * 0.46, 450)
              : Math.min(width * 0.5, 280),
            maxWidth: Math.min(width - padding * 2, isDesktop ? 720 : 340),
            marginBottom: isDesktop ? 60 : 36,
            borderColor: colors.border,
          },
          animatedImageStyle,
        ]}
      >
        <Image
          source={item.image}
          style={styles.image}
          resizeMode="contain"
          accessible={false}
        />
      </Animated.View>

      <Animated.View style={[styles.contentContainer, animatedTextStyle]}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: isDesktop ? 48 : 34,
              lineHeight: isDesktop ? 54 : 40,
              marginBottom: isDesktop ? 24 : 16,
            },
          ]}
        >
          {item.title}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {item.description}
        </Text>
      </Animated.View>
    </View>
  );
}

interface PaginationDotProps {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  onPress: () => void;
  active: boolean;
  reducedMotion: boolean;
}

function PaginationDot({
  index,
  scrollX,
  width,
  onPress,
  active,
  reducedMotion,
}: PaginationDotProps) {
  const { colors } = useTheme();
  const animatedDotStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return {
        opacity: active ? 1 : 0.35,
        width: active ? 24 : 8,
        transform: [{ scale: 1 }],
      };
    }
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.2, 1, 0.2],
      Extrapolate.CLAMP,
    );
    const dotWidth = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [8, 24, 8],
      Extrapolate.CLAMP,
    );
    const scale = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.8, 1, 0.8],
      Extrapolate.CLAMP,
    );

    return {
      opacity,
      width: dotWidth,
      transform: [{ scale }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      style={styles.dotTarget}
      accessibilityRole="tab"
      accessibilityLabel={`Onboarding step ${index + 1}`}
      accessibilityState={{ selected: active }}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: colors.tint }, animatedDotStyle]}
      />
    </Pressable>
  );
}

export function OnboardingCarousel({
  steps,
  onComplete,
}: OnboardingCarouselProps) {
  const { width } = useWindowDimensions();
  const { isExpanded, isLarge } = useWindowClass();
  const { colors } = useTheme();
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<Animated.FlatList<OnboardingStep>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const isDesktop = isExpanded || isLarge;
  const itemPadding = isDesktop ? 32 : 24;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
      if (Platform.OS !== "web") {
        Haptics.selectionAsync();
      }
    }
  };

  const scrollToIndex = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    flatListRef.current?.scrollToIndex({ index, animated: !reducedMotion });
    setCurrentIndex(index);
  };

  const isLastStep = currentIndex === steps.length - 1;

  // Animated button style using withSpring
  const buttonOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: buttonOpacity.value,
      transform: [{ scale: buttonScale.value }],
    };
  });

  useEffect(() => {
    buttonScale.value = reducedMotion ? 1 : withSpring(isLastStep ? 1.05 : 1);
  }, [buttonScale, isLastStep, reducedMotion]);

  return (
    <LinearGradient
      colors={[colors.background, colors.surfaceElevated, colors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Animated.FlatList
        ref={flatListRef}
        data={steps}
        renderItem={({ item, index }) => (
          <OnboardingItem
            item={item}
            index={index}
            scrollX={scrollX}
            width={width}
            padding={itemPadding}
            isDesktop={isDesktop}
          />
        )}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />

      {isDesktop && (
        <>
          {currentIndex > 0 && (
            <Pressable
              style={({ focused }: any) => [
                styles.arrowBtn,
                { left: 40, backgroundColor: colors.card },
                focused && getWebFocusStyle(colors.tint),
              ]}
              onPress={() => scrollToIndex(currentIndex - 1)}
              accessibilityRole="button"
              accessibilityLabel="Previous onboarding step"
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
          )}
          {!isLastStep && (
            <Pressable
              style={({ focused }: any) => [
                styles.arrowBtn,
                { right: 40, backgroundColor: colors.card },
                focused && getWebFocusStyle(colors.tint),
              ]}
              onPress={() => scrollToIndex(currentIndex + 1)}
              accessibilityRole="button"
              accessibilityLabel="Next onboarding step"
            >
              <Ionicons name="chevron-forward" size={28} color={colors.text} />
            </Pressable>
          )}
        </>
      )}

      <View
        style={[
          styles.footer,
          { paddingHorizontal: itemPadding },
          isDesktop && styles.desktopFooter,
        ]}
      >
        <View style={styles.pagination}>
          {steps.map((_, index) => (
            <PaginationDot
              key={index}
              index={index}
              scrollX={scrollX}
              width={width}
              onPress={() => scrollToIndex(index)}
              active={index === currentIndex}
              reducedMotion={reducedMotion}
            />
          ))}
        </View>

        <Animated.View style={animatedButtonStyle}>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.button,
              isDesktop
                ? { maxWidth: 400, alignSelf: "center" }
                : { maxWidth: 420, alignSelf: "center" },
              pressed && { opacity: 0.82 },
              Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
            ]}
            onPress={
              isLastStep ? onComplete : () => scrollToIndex(currentIndex + 1)
            }
            accessibilityRole="button"
            accessibilityLabel={isLastStep ? "Get started" : "Next step"}
          >
            <LinearGradient
              colors={[colors.tint, colors.tint]}
              style={styles.gradient}
            >
              <Text style={[styles.buttonText, { color: colors.onTint }]}>
                {isLastStep ? "Get Started" : "Next Step"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imageContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    alignItems: "center",
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    opacity: 0.9,
    width: "100%",
    fontWeight: "600",
  },
  footer: {
    paddingBottom: 60,
    width: "100%",
  },
  desktopFooter: {
    paddingBottom: 80,
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  dotTarget: {
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  button: {
    width: "100%",
    height: 64,
    borderRadius: 24,
    overflow: "hidden",
    elevation: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 6px 16px rgba(216, 180, 254, 0.32)" }
      : {
          shadowColor: "#d8b4fe",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.32,
          shadowRadius: 16,
        }),
  } as any,
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
  },
  arrowBtn: {
    position: "absolute",
    top: "45%",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(216, 180, 254, 0.35)",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 12px rgba(216, 180, 254, 0.28)" }
      : {
          shadowColor: "#d8b4fe",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 12,
        }),
  } as any,
});
