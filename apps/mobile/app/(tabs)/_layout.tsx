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
import { useRouter } from "expo-router";

function NotificationBell() {
  const { unreadCount } = useNotifications();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  return (
    <Link href={"/notifications" as any} asChild>
      <Pressable
        testID="btn-notifications"
        accessibilityRole="button"
        accessibilityLabel={`Notifications, ${unreadCount} unread`}
      >
        <Ionicons name="notifications-outline" size={24} color="#ffffff" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
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
        <Ionicons name="search-outline" size={24} color="#ffffff" />
      </Pressable>
      <NotificationBell />
    </View>
  );
}

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: "#ffffff",
        headerTitleStyle: {
          fontWeight: "800",
          fontSize: 24,
          letterSpacing: -0.5,
        },
        tabBarStyle: [styles.tabBar, isDesktop && { display: "none" }],
        tabBarActiveTintColor: "#00f2ff",
        tabBarInactiveTintColor: "#555555",
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
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Home",
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          headerRight: () => <HeaderRight />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Discover",
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bookmark" : "bookmark-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Library",
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "cloud-download" : "cloud-download-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Downloads",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Settings",
        }}
      />
    </Tabs>
  );
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
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#010101",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
});
