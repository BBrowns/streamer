import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";
import { SourcesSection } from "../components/settings/SourcesSection";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";

export default function SourcesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <ErrorBoundary>
      <Stack.Screen
        options={{
          headerTitle: t("settings.advanced.title", {
            defaultValue: "Sources & Devices",
          }),
          headerBackTitle: t("library.header.back", { defaultValue: "Back" }),
          headerLargeTitle: true,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <SourcesSection showHeader={false} />
        <View style={styles.spacer} />
      </ScrollView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  spacer: {
    height: 40,
  },
});
