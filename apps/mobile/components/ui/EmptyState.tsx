import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: "small" | "medium" | "large";
}

export function EmptyState({
  icon,
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  size = "medium",
}: EmptyStateProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const isLarge = size === "large" || (size === "medium" && isDesktop);
  const isSmall = size === "small";

  return (
    <View
      style={[styles.container, isLarge && styles.containerLarge]}
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${description ?? ""}`}
    >
      {emoji ? (
        <Text
          style={[
            styles.emoji,
            isLarge && styles.emojiLarge,
            isSmall && styles.emojiSmall,
          ]}
        >
          {emoji}
        </Text>
      ) : icon ? (
        <View
          style={[
            styles.iconContainer,
            isLarge && styles.iconContainerLarge,
            isSmall && styles.iconContainerSmall,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={isLarge ? 64 : isSmall ? 32 : 48}
            color={colors.tint}
          />
        </View>
      ) : null}

      <Text
        style={[
          styles.title,
          { color: colors.text },
          isLarge && styles.titleLarge,
          isSmall && styles.titleSmall,
        ]}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            styles.description,
            { color: colors.textSecondary },
            isLarge && styles.descriptionLarge,
            isSmall && styles.descriptionSmall,
          ]}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Pressable
          style={[
            styles.button,
            { backgroundColor: colors.tint },
            isLarge && styles.buttonLarge,
          ]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text
            style={[
              styles.buttonText,
              { color: isDark ? "#000" : "#fff" },
              isLarge && styles.buttonTextLarge,
            ]}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  containerLarge: {
    padding: 48,
    maxWidth: 800,
    alignSelf: "center",
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emojiLarge: { fontSize: 80, marginBottom: 24 },
  emojiSmall: { fontSize: 32, marginBottom: 8 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  iconContainerLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 32,
  },
  iconContainerSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  titleLarge: {
    fontSize: 36,
    letterSpacing: -1,
    marginBottom: 16,
  },
  titleSmall: {
    fontSize: 16,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 320,
    fontWeight: "600",
  },
  descriptionLarge: {
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 500,
    marginBottom: 40,
  },
  descriptionSmall: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 240,
    marginBottom: 16,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonLarge: {
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 18,
  },
  buttonText: {
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  buttonTextLarge: {
    fontSize: 18,
    letterSpacing: 1,
  },
});
