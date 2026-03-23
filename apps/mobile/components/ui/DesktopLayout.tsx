import React from "react";
import {
  View,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
} from "react-native";
import { Link, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  const pathname = usePathname();
  const { width } = Dimensions.get("window");
  const isDesktop = Platform.OS === "web" && width > 1024;

  if (!isDesktop) return <>{children}</>;

  return (
    <View style={styles.container}>
      {/* Persistent Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.logoContainer}>
          <Ionicons name="play-circle" size={40} color="#00f2ff" />
        </View>

        <View style={styles.nav}>
          <NavLink
            href="/"
            icon="home-outline"
            activeIcon="home"
            label="Home"
            active={pathname === "/"}
          />
          <NavLink
            href="/discover"
            icon="compass-outline"
            activeIcon="compass"
            label="Discover"
            active={pathname === "/discover"}
          />
          <NavLink
            href="/library"
            icon="library-outline"
            activeIcon="library"
            label="Library"
            active={pathname === "/library"}
          />
        </View>

        <View style={styles.spacer} />

        <View style={styles.nav}>
          <NavLink
            href="/settings"
            icon="settings-outline"
            activeIcon="settings"
            label="Settings"
            active={pathname === "/settings"}
          />
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function NavLink({ href, icon, activeIcon, label, active }: any) {
  return (
    <Link href={href} asChild>
      <View
        style={StyleSheet.flatten([
          styles.navLink,
          active && styles.navLinkActive,
        ])}
      >
        <Ionicons
          name={active ? activeIcon : icon}
          size={24}
          color={active ? "#00f2ff" : "#888888"}
        />
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#010101",
  },
  sidebar: {
    width: 80,
    backgroundColor: "#080808",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    paddingVertical: 30,
  },
  logoContainer: {
    marginBottom: 40,
  },
  nav: {
    gap: 20,
  },
  navLink: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  navLinkActive: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
  },
  spacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: "#010101",
  },
});
