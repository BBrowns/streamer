import React, { useCallback, useState, useRef } from "react";
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
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  colors: [string, string];
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
}

function OnboardingItem({ item, index, scrollX, width }: OnboardingItemProps) {
  const { colors } = useTheme();
  const STEP_WIDTH = width;
  const inputRange = [
    (index - 1) * STEP_WIDTH,
    index * STEP_WIDTH,
    (index + 1) * STEP_WIDTH,
  ];

  const animatedImageStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.8, 1, 0.8],
      Extrapolate.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolate.CLAMP,
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollX.value,
      inputRange,
      [50, 0, 50],
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
    <View style={[styles.stepContainer, { width: STEP_WIDTH }]}>
      <Animated.View
        style={[
          styles.imageContainer,
          { height: width * 0.4, maxHeight: 400 },
          animatedImageStyle,
        ]}
      >
        <Image source={item.image} style={styles.image} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={[styles.contentContainer, animatedTextStyle]}>
        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
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
}

function PaginationDot({ index, scrollX, width, onPress }: PaginationDotProps) {
  const animatedDotStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.4, 1, 0.4],
      Extrapolate.CLAMP,
    );
    const scale = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [1, 1.3, 1],
      Extrapolate.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.dot, animatedDotStyle]} />
    </Pressable>
  );
}

export function OnboardingCarousel({
  steps,
  onComplete,
}: OnboardingCarouselProps) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<Animated.FlatList<OnboardingStep>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      const index = Math.round(event.contentOffset.x / width);
      // We can't call setState here directly, but we can verify it roughly
    },
  });

  // Track current index on JS thread for UI controls
  const handleScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const scrollToIndex = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const isLastStep = currentIndex === steps.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.FlatList
        ref={flatListRef}
        data={steps}
        renderItem={({ item, index }) => (
          <OnboardingItem
            item={item}
            index={index}
            scrollX={scrollX}
            width={width}
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
              style={[
                styles.arrowBtn,
                { left: 40, backgroundColor: colors.card },
              ]}
              onPress={() => scrollToIndex(currentIndex - 1)}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
          )}
          {!isLastStep && (
            <Pressable
              style={[
                styles.arrowBtn,
                { right: 40, backgroundColor: colors.card },
              ]}
              onPress={() => scrollToIndex(currentIndex + 1)}
            >
              <Ionicons name="chevron-forward" size={28} color={colors.text} />
            </Pressable>
          )}
        </>
      )}

      <View style={[styles.footer, isDesktop && styles.desktopFooter]}>
        <View style={styles.pagination}>
          {steps.map((_, index) => (
            <PaginationDot
              key={index}
              index={index}
              scrollX={scrollX}
              width={width}
              onPress={() => scrollToIndex(index)}
            />
          ))}
        </View>

        <Pressable
          style={[
            styles.button,
            isDesktop && { maxWidth: 400, alignSelf: "center" },
          ]}
          onPress={
            isLastStep ? onComplete : () => scrollToIndex(currentIndex + 1)
          }
        >
          <LinearGradient
            colors={["#818cf8", "#6366f1"]}
            style={styles.gradient}
          >
            <Text style={styles.buttonText}>
              {isLastStep ? "Get Started" : "Next Step"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050614",
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  imageContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    alignItems: "center",
    maxWidth: 600,
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: -1,
  },
  description: {
    fontSize: 18,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 28,
    paddingHorizontal: 20,
  },
  footer: {
    paddingBottom: 60,
    paddingHorizontal: 32,
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
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366f1",
    marginHorizontal: 6,
  },
  button: {
    width: "100%",
    height: 60,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  arrowBtn: {
    position: "absolute",
    top: "45%",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});
