import React, { ReactNode } from "react";
import {
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

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
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const isWide = Platform.OS === "web" && width >= 900;

  return (
    <LinearGradient
      colors={
        isDark
          ? ["#11121c", "#171423", "#231727"]
          : ["#fff9f6", "#f7f0ff", "#ecfbf3"]
      }
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
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.7)",
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBadge,
                    { backgroundColor: colors.tint + "28" },
                  ]}
                >
                  <Ionicons name={icon} size={18} color={colors.tint} />
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
                    Pastel cinema
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.formPane,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.74)",
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
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
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
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
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    shadowColor: "#d8b4fe",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 24,
  },
});
