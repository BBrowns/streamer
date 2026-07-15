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
        {t("legal.lastUpdated", { date: t("legal.updatedDate") })}
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.1")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.terms.1")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.2")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.terms.2")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.3")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.terms.3")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.tint }]}>
          {t("legal.sections.terms.4")}
        </Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {t("legal.bodies.terms.4")}
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
