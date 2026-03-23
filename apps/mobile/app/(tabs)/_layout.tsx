import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Platform, useWindowDimensions } from "react-native";

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
});
