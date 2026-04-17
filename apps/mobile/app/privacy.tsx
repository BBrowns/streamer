import React from "react";
import { ScrollView, Text, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: t("legal.privacyTitle") }} />
      <Text style={[styles.title, { color: colors.text }]}>
        {t("legal.privacyTitle")}
      </Text>
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {t("legal.lastUpdated", { date: "April 1, 2026" })}
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.1")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          We collect only the most essential information to enable cross-device
          synchronization. This includes your email (for account creation) and
          metadata hashes for items in your library.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.2")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          We do NOT store or access any sensitive information, including payment
          data, beyond what is necessary to authenticate your account. We do Not
          track your specific viewing content; only the metadata required for
          library syncing.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.3")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          We do not sell or share your personal information with third parties
          for marketing purposes. Your data is used exclusively to provide the
          Streamer service.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.4")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          You can delete your account and all associated data at any time
          through the application's settings screen.
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
