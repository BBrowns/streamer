import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import { useNotifications } from "../hooks/useNotifications";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { getWebFocusStyle } from "../components/ui/designSystem";

export default function NotificationsScreen() {
  const { notifications, isLoading, markAsRead } = useNotifications();
  const { colors } = useTheme();
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
            style={({ pressed, focused }: any) => [
              styles.notificationCard,
              {
                backgroundColor: colors.card,
                borderColor: "transparent",
              },
              !item.read && {
                backgroundColor: colors.tint + "12",
              },
              pressed && { opacity: 0.72 },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
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
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  notificationCard: {
    minHeight: 72,
    flexDirection: "row",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  iconContainer: {
    marginRight: 16,
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: "bold",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: "center",
    marginLeft: 8,
  },
});
