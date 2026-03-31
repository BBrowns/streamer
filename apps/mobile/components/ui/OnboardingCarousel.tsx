import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  Pressable,
  ImageSourcePropType,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

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

const STEP_WIDTH = width;

export function OnboardingCarousel({
  steps,
  onComplete,
}: OnboardingCarouselProps) {
  const scrollX = useSharedValue(0);
  const flatListRef = React.useRef<Animated.FlatList<OnboardingStep>>(null);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: OnboardingStep; index: number }) => {
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
          <Animated.View style={[styles.imageContainer, animatedImageStyle]}>
            <Image
              source={item.image}
              style={styles.image}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={[styles.contentContainer, animatedTextStyle]}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </Animated.View>
        </View>
      );
    },
    [],
  );

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={steps}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        bounces={false}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {steps.map((_, index) => {
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
              <Animated.View
                key={index}
                style={[styles.dot, animatedDotStyle]}
              />
            );
          })}
        </View>

        <Pressable style={styles.button} onPress={onComplete}>
          <LinearGradient
            colors={["#818cf8", "#6366f1"]}
            style={styles.gradient}
          >
            <Text style={styles.buttonText}>Get Started</Text>
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
    height: width * 0.8,
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
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  footer: {
    paddingBottom: 60,
    paddingHorizontal: 32,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 32,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#818cf8",
    marginHorizontal: 4,
  },
  button: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
  },
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
