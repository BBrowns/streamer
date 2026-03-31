import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Privacy Policy",
          headerTitleStyle: { color: "#fff" },
          headerStyle: { backgroundColor: "#050614" },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 8 }}>
              <Ionicons name="chevron-back" size={24} color="#00f2ff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Privacy Matters</Text>
        <Text style={styles.date}>Last Updated: March 31, 2026</Text>

        <Text style={styles.sectionTitle}>1. Data Collection</Text>
        <Text style={styles.text}>
          Streamer is a self-hosted ecosystem. We do not sell your personal
          information. When you use our official backend, we store your email
          (for account recovery), your encrypted library, and watch progress to
          enable cross-device syncing.
        </Text>

        <Text style={styles.sectionTitle}>2. Local Processing</Text>
        <Text style={styles.text}>
          Most processing, including torrent streaming and metadata fetching,
          happens locally on your device or your personal stream-server bridge.
        </Text>

        <Text style={styles.sectionTitle}>3. Your Rights (GDPR)</Text>
        <Text style={styles.text}>
          You have the right to access your data and the right to be forgotten.
          Use the "Export My Data" and "Delete Account" buttons in Settings to
          exercise these rights.
        </Text>

        <Text style={styles.sectionTitle}>4. Security</Text>
        <Text style={styles.text}>
          We use industry-standard encryption for data at rest and in transit.
          Biometric data used for unlocking the app never leaves your device's
          Secure Enclave or Trusted Execution Environment.
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 Streamer OSS Project</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050614" },
  content: { padding: 24, paddingBottom: 60 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "900", marginBottom: 8 },
  date: { color: "#64748b", fontSize: 13, marginBottom: 32 },
  sectionTitle: {
    color: "#00f2ff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 12,
  },
  text: { color: "#94a3b8", fontSize: 15, lineHeight: 24 },
  footer: { marginTop: 48, alignItems: "center" },
  footerText: { color: "#475569", fontSize: 12 },
});
