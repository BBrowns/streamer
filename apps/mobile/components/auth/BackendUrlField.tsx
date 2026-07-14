import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BASE_URL } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";

type Status = "idle" | "checking" | "ok" | "error";

export function BackendUrlField() {
  const { colors } = useTheme();
  const backendUrl = useAuthStore((s) => s.backendUrl);
  const setServerUrls = useAuthStore((s) => s.setServerUrls);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(backendUrl || BASE_URL);
  const [status, setStatus] = useState<Status>("idle");

  const normalizedValue = value.trim().replace(/\/+$/, "");
  const activeUrl = backendUrl || BASE_URL;

  const save = () => {
    setServerUrls(normalizedValue || null, undefined);
    setExpanded(false);
    setStatus("idle");
  };

  const check = async () => {
    setStatus("checking");
    try {
      const response = await fetch(`${normalizedValue}/health`);
      setStatus(response.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            API server
          </Text>
          <Text style={[styles.url, { color: colors.text }]} numberOfLines={1}>
            {activeUrl}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "options-outline"}
          size={20}
          color={colors.tint}
        />
      </Pressable>

      {expanded && (
        <View style={styles.editor}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setStatus("idle");
            }}
            placeholder="http://192.168.1.20:3001"
            placeholderTextColor={colors.textSecondary + "80"}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {status === "ok" && (
            <Text style={[styles.status, { color: colors.success }]}>
              Server bereikbaar
            </Text>
          )}
          {status === "error" && (
            <Text style={[styles.status, { color: colors.error }]}>
              Geen verbinding met deze server
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              style={[
                styles.secondaryButton,
                { borderColor: colors.border },
                status === "checking" && styles.disabled,
              ]}
              onPress={check}
              disabled={status === "checking"}
            >
              {status === "checking" ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.secondaryText, { color: colors.text }]}>
                  Test
                </Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              onPress={save}
            >
              <Text style={[styles.primaryText, { color: colors.onTint }]}>
                Gebruik
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  url: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  editor: {
    padding: 14,
    paddingTop: 0,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  status: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "800",
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.7,
  },
});
