import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { hapticSelection } from "../../lib/haptics";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsibleSection({
  title,
  icon,
  iconColor,
  iconBg,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotateAnim = useRef(
    new Animated.Value(defaultExpanded ? 1 : 0),
  ).current;
  const isWeb = Platform.OS === "web";

  const toggle = () => {
    hapticSelection();
    Animated.spring(rotateAnim, {
      toValue: expanded ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    setExpanded((prev) => !prev);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed, hovered }: any) => [
          styles.header,
          {
            backgroundColor: expanded
              ? isDark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.03)"
              : "transparent",
            borderColor: colors.border,
          },
          isWeb &&
            hovered && {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.04)",
            },
          pressed && { opacity: 0.8 },
        ]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} section, ${expanded ? "expanded" : "collapsed"}`}
      >
        {icon && (
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: iconBg ?? "rgba(255,255,255,0.08)" },
            ]}
          >
            <Ionicons
              name={icon}
              size={16}
              color={iconColor ?? colors.textSecondary}
            />
          </View>
        )}
        <Text style={[styles.headerText, { color: colors.text }]}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Animated.View>
      </Pressable>

      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 10,
    // @ts-ignore web-only
    cursor: Platform.OS === "web" ? "pointer" : undefined,
    transition: "background-color 0.15s ease",
  } as any,
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  body: {
    paddingTop: 4,
    gap: 0,
  },
});
