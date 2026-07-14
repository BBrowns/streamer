import React, { ReactNode } from "react";
import {
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { Stack } from "expo-router";
import { uiRadii, uiTypography } from "../ui/designSystem";

interface AuthScaffoldProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  image: ImageSourcePropType;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function AuthScaffold({
  title,
  subtitle,
  children,
  image,
  icon = "play",
}: AuthScaffoldProps) {
  const { colors } = useTheme();
  const { isExpanded, isLarge } = useWindowClass();
  const isWide = isExpanded || isLarge;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[colors.background, colors.surfaceSubtle, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          enabled={Platform.OS !== "web"}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              isWide ? styles.scrollWide : styles.scrollNarrow,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.shell, isWide && styles.shellWide]}>
              <View style={[styles.previewPane, isWide && styles.previewWide]}>
                <Image source={image} style={styles.previewImage} />
                <View
                  style={[
                    styles.previewGlass,
                    {
                      backgroundColor: colors.surfaceOverlay,
                      borderColor: "transparent",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons name={icon} size={18} color={colors.onPrimary} />
                  </View>
                  <View style={styles.previewTextGroup}>
                    <Text style={[styles.previewTitle, { color: colors.text }]}>
                      Streamer
                    </Text>
                    <Text
                      style={[
                        styles.previewSubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Your cinematic library
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.formPane,
                  {
                    backgroundColor: colors.card,
                    borderColor: "transparent",
                  },
                ]}
              >
                <Text style={[styles.title, { color: colors.text }]}>
                  {title}
                </Text>
                <Text
                  style={[styles.subtitle, { color: colors.textSecondary }]}
                >
                  {subtitle}
                </Text>
                {children}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: 20,
  },
  scrollNarrow: {
    justifyContent: "center",
  },
  scrollWide: {
    justifyContent: "center",
    padding: 40,
  },
  shell: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    gap: 20,
  },
  shellWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  previewPane: {
    minHeight: 220,
    borderRadius: uiRadii.hero,
    overflow: "hidden",
  },
  previewWide: {
    flex: 1,
    minHeight: 560,
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewGlass: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    borderRadius: uiRadii.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  previewTextGroup: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  previewSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  formPane: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: uiRadii.sheet,
    borderWidth: 0,
    padding: 28,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 44px rgba(0,0,0,0.16)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.16,
          shadowRadius: 32,
        }),
  } as any,
  title: {
    ...uiTypography.headline,
    marginBottom: 8,
  },
  subtitle: {
    ...uiTypography.body,
    marginBottom: 24,
  },
});
