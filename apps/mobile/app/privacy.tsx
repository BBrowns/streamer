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
        {t("legal.lastUpdated", { date: t("legal.updatedDate") })}
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.1")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.privacy.1")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.2")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.privacy.2")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.3")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.privacy.3")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.privacy.4")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.privacy.4")}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: "900", marginBottom: 8 },
  date: { fontSize: 14, marginBottom: 32 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  text: { fontSize: 15, lineHeight: 24 },
});
