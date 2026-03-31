import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Terms of Service",
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
        <Text style={styles.title}>Legal Terms</Text>
        <Text style={styles.date}>Last Updated: March 31, 2026</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.text}>
          By using Streamer, you agree to these terms. Streamer is a tool for
          content aggregation and does not host or store any media.
        </Text>

        <Text style={styles.sectionTitle}>2. User Responsibility</Text>
        <Text style={styles.text}>
          You are responsible for the add-ons you install and the content you
          access. Use of copyrighted material must be authorized by the rights
          holder. Streamer project contributors are not liable for user actions.
        </Text>

        <Text style={styles.sectionTitle}>3. Open Source</Text>
        <Text style={styles.text}>
          Streamer is an open-source project. Modification and redistribution
          are permitted under the project's license (e.g., MIT/GPL), but these
          Terms of Service apply to the official builds and backend services.
        </Text>

        <Text style={styles.sectionTitle}>4. Termination</Text>
        <Text style={styles.text}>
          We reserve the right to block accounts found to be abusing the global
          sync network (e.g., DDoS or data scraping).
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
