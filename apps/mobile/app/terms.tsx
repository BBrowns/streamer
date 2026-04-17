import React from "react";
import { ScrollView, Text, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";

export default function TermsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: t("legal.termsTitle") }} />
      <Text style={[styles.title, { color: colors.text }]}>
        {t("legal.termsTitle")}
      </Text>
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {t("legal.lastUpdated", { date: "April 1, 2026" })}
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.1")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          By accessing or using the Streamer application, you agree to be bound
          by these Terms of Service. If you do not agree to these terms, please
          do not use the application.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.2")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          Streamer is a media aggregation tool. You are responsible for the
          content you access through the platform. We do not host or monitor
          third-party add-ons or content.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.3")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          You retain all rights to any content you provide to the service. By
          providing content, you grant us a non-exclusive, royalty-free license
          to use, display, and distribute that content within the scope of the
          service.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.4")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          Streamer is provided "as is" without any warranties. We are not
          responsible for any damage or loss resulting from your use of the
          application or the content accessed through it.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050614" },
  content: { padding: 24, paddingBottom: 60 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "900", marginBottom: 8 },
  date: { color: "#64748b", fontSize: 14, marginBottom: 32 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: "#00f2ff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  text: { color: "#94a3b8", fontSize: 15, lineHeight: 24 },
});
