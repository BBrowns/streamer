import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Dimensions,
  Text,
  Pressable,
  TextInput,
} from "react-native";
import { Link, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSearchStore } from "../../stores/searchStore";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { query, setQuery } = useSearchStore();
  const searchInputRef = useRef<TextInput>(null);
  const { width } = Dimensions.get("window");
  const isDesktop = Platform.OS === "web" && width > 1024;

  // CMD+K Command Palette Shortcut
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Live Transition: If user types, ensure we are on the search page
  const handleSearchChange = (text: string) => {
    setQuery(text);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (text.length > 0 && pathname !== "/search") {
      searchTimeoutRef.current = setTimeout(() => {
        router.push("/search");
      }, 300); // 300ms debounce
    }
  };

  if (!isDesktop) return <>{children}</>;

  return (
    <View style={styles.container}>
      {/* Cinematic Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow} />
          <Ionicons name="play-circle" size={42} color="#00f2ff" />
          <Text style={styles.logoText}>STREAMER</Text>
        </View>

        {/* Global Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={18}
            color="#94a3b8"
            style={styles.searchIcon}
          />
          {/* Dummy hidden input to trap browser autofill (e.g. Chrome/1Password) */}
          <TextInput
            style={{ position: "absolute", opacity: 0, height: 0, width: 0 }}
            aria-hidden={true}
            tabIndex={-1}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search... (⌘K)"
            placeholderTextColor="#475569"
            value={query}
            onChangeText={handleSearchChange}
            accessibilityLabel="Search input"
            autoComplete="new-password"
            autoCorrect={false}
            spellCheck={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color="#475569" />
            </Pressable>
          )}
        </View>

        <View style={styles.navGroup}>
          <Text style={styles.navHeading}>Menu</Text>
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
            icon="bookmark-outline"
            activeIcon="bookmark"
            label="Library"
            active={pathname === "/library"}
          />
        </View>

        <View style={styles.spacer} />

        <View style={styles.navGroup}>
          <Text style={styles.navHeading}>Support</Text>
          <NavLink
            href="/addons"
            icon="extension-puzzle-outline"
            activeIcon="extension-puzzle"
            label="Add-ons"
            active={pathname === "/addons"}
          />
          <NavLink
            href="/settings"
            icon="settings-outline"
            activeIcon="settings"
            label="Settings"
            active={pathname === "/settings"}
          />
        </View>

        <View style={styles.userSection}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person-circle-outline" size={32} color="#888" />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>Guest User</Text>
            <Text style={styles.userStatus}>Online</Text>
          </View>
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
      <Pressable>
        <View
          style={StyleSheet.flatten([
            styles.navLink,
            active && styles.navLinkActive,
          ])}
        >
          <Ionicons
            name={active ? activeIcon : icon}
            size={22}
            color={active ? "#00f2ff" : "#94a3b8"}
          />
          <Text
            style={[styles.navLinkLabel, active && styles.navLinkLabelActive]}
          >
            {label}
          </Text>
          {active && <View style={styles.activeIndicator} />}
        </View>
      </Pressable>
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
    width: 260,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    // @ts-ignore - Web only property for glassmorphism
    backdropFilter: "blur(20px)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 32,
    paddingHorizontal: 16,
    height: "100%",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    height: 40,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    // @ts-ignore
    outlineStyle: "none" as any,
  },
  logoGlow: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00f2ff",
    opacity: 0.2,
    filter: "blur(15px)",
  },
  logoText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginLeft: 12,
    letterSpacing: 2,
  },
  navGroup: {
    marginBottom: 32,
  },
  navHeading: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  navLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: "transparent",
    position: "relative",
  },
  navLinkActive: {
    backgroundColor: "rgba(0, 242, 255, 0.08)",
  },
  navLinkLabel: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 14,
  },
  navLinkLabelActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  activeIndicator: {
    position: "absolute",
    left: -16,
    width: 4,
    height: 24,
    backgroundColor: "#00f2ff",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    boxShadow: [
      {
        color: "rgba(0, 242, 255, 0.8)",
        offsetX: 0,
        offsetY: 0,
        blurRadius: 10,
      },
    ],
  },
  spacer: {
    flex: 1,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    marginTop: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    marginLeft: 12,
  },
  userName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  userStatus: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    backgroundColor: "#010101",
  },
});
