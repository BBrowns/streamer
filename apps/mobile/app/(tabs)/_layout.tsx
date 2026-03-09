import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: "#e0e0ff",
        headerTitleStyle: { fontWeight: "700", fontSize: 20 },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#818cf8",
        tabBarInactiveTintColor: "#6b7280",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Home",
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Discover",
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Library",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Settings",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#0a0a1a",
    boxShadow: "0px 1px 8px rgba(129, 140, 248, 0.15)",
    elevation: 8,
  },
  tabBar: {
    backgroundColor: "#0d0d24",
    borderTopColor: "rgba(129, 140, 248, 0.15)",
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 4,
    height: 64,
  },
});
