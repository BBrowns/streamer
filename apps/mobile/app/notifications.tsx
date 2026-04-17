import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNotifications } from "../hooks/useNotifications";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";

export default function NotificationsScreen() {
  const { notifications, isLoading, markAsRead } = useNotifications();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (notifications.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons
          name="bell-off-outline"
          size={48}
          color={colors.textSecondary}
        />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t("notifications.empty")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.notificationCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
              !item.read && {
                backgroundColor: isDark
                  ? "rgba(99, 102, 241, 0.1)"
                  : colors.tint + "10",
                borderColor: colors.tint,
              },
            ]}
            onPress={() => {
              if (!item.read) markAsRead.mutate(item.id);
            }}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={24}
                color={item.read ? colors.textSecondary : colors.tint}
              />
            </View>
            <View style={styles.textContainer}>
              <Text
                style={[
                  styles.title,
                  { color: colors.text },
                  !item.read && styles.unreadTitle,
                ]}
              >
                {item.title}
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {item.message}
              </Text>
              <Text
                style={[styles.date, { color: colors.textSecondary + "90" }]}
              >
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </View>
            {!item.read && (
              <View
                style={[styles.unreadDot, { backgroundColor: colors.tint }]}
              />
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050510",
  },
  center: {
    flex: 1,
    backgroundColor: "#050510",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 16,
    marginTop: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  notificationCard: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  unreadCard: {
    backgroundColor: "#1e1b4b",
    borderColor: "#4338ca",
  },
  iconContainer: {
    marginRight: 16,
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  unreadTitle: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  message: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  date: {
    color: "#64748b",
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#818cf8",
    alignSelf: "center",
    marginLeft: 8,
  },
});
