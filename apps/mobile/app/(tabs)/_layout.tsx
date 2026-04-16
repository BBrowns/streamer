import { Tabs, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Platform,
  useWindowDimensions,
  View,
  Text,
  Pressable,
} from "react-native";
import { useNotifications } from "../../hooks/useNotifications";
import { useAuthStore } from "../../stores/authStore";
import { useState } from "react";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";

function NotificationBell() {
  const { unreadCount } = useNotifications();
  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  return (
    <Link href={"/notifications" as any} asChild>
      <Pressable
        testID="btn-notifications"
        accessibilityRole="button"
        accessibilityLabel={`Notifications, ${unreadCount} unread`}
      >
        <Ionicons name="notifications-outline" size={24} color={colors.text} />
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

function HeaderRight() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        marginRight: 16,
      }}
    >
      <Pressable
        onPress={() => {
          // Trigger search overlay via global event
          const { DeviceEventEmitter } = require("react-native");
          DeviceEventEmitter.emit("SHOW_SEARCH");
        }}
        accessibilityRole="button"
        accessibilityLabel="Search"
      >
        <Ionicons name="search-outline" size={24} color={colors.text} />
      </Pressable>
      <NotificationBell />
    </View>
  );
}

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const tabsContent = (
    <Tabs
      screenOptions={{
        headerStyle: [
          styles.header,
          { backgroundColor: colors.header, borderBottomColor: colors.border },
        ],
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "800",
          fontSize: 24,
          letterSpacing: -0.5,
        },
        // Hide header on desktop — the DesktopLayout sidebar handles navigation
        headerShown: !isDesktop,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
          },
          isDesktop && { display: "none" },
        ],
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: isDark ? "#555555" : "#94a3b8",
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.home"),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t("tabs.discover"),
          headerRight: () => <HeaderRight />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.discover"),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("tabs.library"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bookmark" : "bookmark-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.library"),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: t("tabs.downloads"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "cloud-download" : "cloud-download-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.downloads"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.settings"),
        }}
      />
    </Tabs>
  );

  return tabsContent;
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#010101",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    elevation: 0,
  },
  tabBar: {
    backgroundColor: "#080808",
    borderTopColor: "rgba(255,255,255,0.05)",
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingTop: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
  sidebar: {
    width: 260,
    borderRightWidth: 1,
  },
  sidebarHeader: {
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sidebarTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  sidebarNav: {
    paddingHorizontal: 16,
    gap: 4,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 16,
    // @ts-ignore Web-only cursor
    cursor: "pointer",
  },
  sidebarItemText: {
    fontSize: 16,
  },
});
