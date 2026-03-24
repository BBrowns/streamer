import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
  Pressable,
} from "react-native";
import { Link, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface DesktopLayoutProps {
  children: React.ReactNode;
  onSearchOpen?: () => void;
}

const NAV_ITEMS = [
  {
    href: "/",
    icon: "home-outline" as const,
    activeIcon: "home" as const,
    label: "Home",
  },
  {
    href: "/discover",
    icon: "compass-outline" as const,
    activeIcon: "compass" as const,
    label: "Discover",
  },
  {
    href: "/library",
    icon: "bookmark-outline" as const,
    activeIcon: "bookmark" as const,
    label: "Library",
  },
  {
    href: "/downloads",
    icon: "cloud-download-outline" as const,
    activeIcon: "cloud-download" as const,
    label: "Downloads",
  },
];

export function DesktopLayout({ children, onSearchOpen }: DesktopLayoutProps) {
  const pathname = usePathname();
  const { width } = Dimensions.get("window");
  const isDesktop = Platform.OS === "web" && width > 1024;

  if (!isDesktop) return <>{children}</>;

  return (
    <View style={styles.container}>
      {/* Persistent Sidebar */}
      <View style={styles.sidebar}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIconWrap}>
            <Ionicons name="play" size={18} color="#000" />
          </View>
          <Text style={styles.logoText}>Streamer</Text>
        </View>

        {/* Main nav */}
        <View style={styles.nav}>
          <Text style={styles.navSectionLabel}>MENU</Text>
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname === "/index"
                : pathname.startsWith(item.href);
            return (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                activeIcon={item.activeIcon}
                label={item.label}
                active={active}
              />
            );
          })}
        </View>

        <View style={styles.spacer} />

        {/* Settings at bottom */}
        <View style={styles.nav}>
          <NavLink
            href="/settings"
            icon="settings-outline"
            activeIcon="settings"
            label="Settings"
            active={pathname === "/settings"}
          />
          {/* Search button */}
          {!!onSearchOpen && (
            <Pressable
              style={({ pressed }) => [
                styles.navLink,
                pressed && styles.navLinkPressed,
              ]}
              onPress={onSearchOpen}
              accessibilityLabel="Search (⌘K)"
            >
              <View style={styles.navLinkInner}>
                <Ionicons name="search-outline" size={20} color="#6b7280" />
                <Text style={styles.navLabel}>Search</Text>
              </View>
              <View style={styles.kbdHint}>
                <Text style={styles.kbdText}>⌘K</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function NavLink({
  href,
  icon,
  activeIcon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href as any} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.navLink,
          active && styles.navLinkActive,
          pressed && styles.navLinkPressed,
        ]}
        accessibilityRole="link"
        accessibilityLabel={label}
      >
        {active && <View style={styles.activeBar} />}
        <View style={styles.navLinkInner}>
          <Ionicons
            name={active ? activeIcon : icon}
            size={20}
            color={active ? "#00f2ff" : "#6b7280"}
          />
          <Text style={[styles.navLabel, active && styles.navLabelActive]}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#07070e",
  },
  sidebar: {
    width: 220,
    backgroundColor: "#0a0a14",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  logoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#00f2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  navSectionLabel: {
    color: "#374151",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  nav: {
    gap: 2,
  },
  navLink: {
    position: "relative",
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  navLinkActive: {
    backgroundColor: "rgba(0, 242, 255, 0.08)",
  },
  navLinkPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#00f2ff",
  },
  navLinkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  navLabel: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
  navLabelActive: {
    color: "#e2e8f0",
    fontWeight: "700",
  },
  spacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: "#07070e",
  },
  kbdHint: {
    marginLeft: "auto",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  kbdText: {
    color: "#4b5563",
    fontSize: 10,
    fontWeight: "800",
  },
});
