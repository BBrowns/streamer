import React from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { Link, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { useWindowClass } from "../../hooks/useWindowClass";
import { isFullScreenRoute } from "./desktopShellRoutes";

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
    href: "/search",
    icon: "search-outline" as const,
    activeIcon: "search" as const,
    label: "Search",
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
  const { windowClass, hasSideNavigation } = useWindowClass();
  const { colors } = useTheme();
  const isLarge = windowClass === "large";
  const isExpanded = windowClass === "expanded";
  const sideWindowClass = windowClass === "compact" ? "medium" : windowClass;
  const isImmersiveRoute = isFullScreenRoute(pathname);

  if (!hasSideNavigation) return <>{children}</>;

  if (isImmersiveRoute) {
    return (
      <View
        style={[
          styles.immersiveContainer,
          { backgroundColor: colors.background },
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Persistent Sidebar */}
      <View
        style={[
          styles.sidebar,
          windowClass === "medium" && styles.sidebarMedium,
          isExpanded && styles.sidebarExpanded,
          {
            backgroundColor: colors.tabBar,
            borderRightColor: colors.border,
          },
        ]}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={[styles.logoIconWrap, { backgroundColor: colors.tint }]}>
            <Ionicons name="play" size={18} color={colors.onTint} />
          </View>
          {isLarge && (
            <Text style={[styles.logoText, { color: colors.text }]}>
              Streamer
            </Text>
          )}
        </View>

        {/* Main nav */}
        <View style={styles.nav}>
          {isLarge && (
            <Text
              style={[
                styles.navSectionLabel,
                { color: colors.textSecondary + "90" },
              ]}
            >
              MENU
            </Text>
          )}
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
                windowClass={sideWindowClass}
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
            windowClass={sideWindowClass}
          />
          {!!onSearchOpen && isLarge && (
            <SearchNavButton onSearchOpen={onSearchOpen} />
          )}
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function SearchNavButton({ onSearchOpen }: { onSearchOpen: () => void }) {
  const { colors, isDark } = useTheme();
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(onSearchOpen);

  return (
    <Pressable
      {...webPressableProps}
      style={({ pressed }) => [
        styles.navLink,
        isKeyboardFocused && styles.navLinkFocused,
        pressed && {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.05)",
        },
      ]}
      onPress={onSearchOpen}
      accessibilityRole="button"
      accessibilityLabel="Search (⌘K)"
    >
      <View style={styles.navLinkInner}>
        <Ionicons
          name="search-outline"
          size={20}
          color={isKeyboardFocused ? colors.text : colors.textSecondary}
        />
        <Text
          style={[
            styles.navLabel,
            { color: isKeyboardFocused ? colors.text : colors.textSecondary },
          ]}
        >
          Search
        </Text>
      </View>
      <View
        style={[
          styles.kbdHint,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
          },
        ]}
      >
        <Text style={[styles.kbdText, { color: colors.textSecondary }]}>
          ⌘K
        </Text>
      </View>
    </Pressable>
  );
}

function NavLink({
  href,
  icon,
  activeIcon,
  label,
  active,
  windowClass,
}: {
  href: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  windowClass: "medium" | "expanded" | "large";
}) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [isHovered, setIsHovered] = React.useState(false);
  const isWeb = Platform.OS === "web";
  const { isKeyboardFocused, webPressableProps } = useWebPressableActivation(
    () => router.push(href as any),
  );

  return (
    <Link href={href as any} asChild>
      <Pressable
        {...webPressableProps}
        style={({ pressed }) => [
          styles.navLink,
          windowClass !== "large" && styles.navLinkRail,
          active && { backgroundColor: colors.tint + "15" },
          isWeb &&
            isHovered &&
            !active && {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.03)",
            },
          isWeb && isKeyboardFocused && styles.navLinkFocused,
          pressed && {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.05)",
          },
        ]}
        onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
        onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
        accessibilityRole="link"
        accessibilityLabel={label}
      >
        {active && (
          <View style={[styles.activeBar, { backgroundColor: colors.tint }]} />
        )}
        <View
          style={[
            styles.navLinkInner,
            windowClass !== "large" && styles.navLinkInnerRail,
          ]}
        >
          <Ionicons
            name={active ? activeIcon : icon}
            size={20}
            color={active ? colors.tint : colors.textSecondary}
          />
          {windowClass !== "medium" && (
            <Text
              style={[
                styles.navLabel,
                windowClass === "expanded" && styles.navLabelExpanded,
                { color: active ? colors.text : colors.textSecondary },
                active && { fontWeight: "700" },
                isWeb &&
                  (isHovered || isKeyboardFocused) &&
                  !active && { color: colors.text },
              ]}
            >
              {label}
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  immersiveContainer: { flex: 1 },
  sidebar: {
    width: 216,
    borderRightWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  sidebarMedium: {
    width: 72,
    paddingHorizontal: 8,
  },
  sidebarExpanded: {
    width: 88,
    paddingHorizontal: 8,
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
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  navSectionLabel: {
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
  navLinkFocused: {
    // @ts-ignore web-only
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineColor: "#a78bfa",
    outlineOffset: 2,
  } as any,
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  navLinkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  navLinkRail: {
    justifyContent: "center",
  },
  navLinkInnerRail: {
    flexDirection: "column",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  navLabelExpanded: {
    fontSize: 10,
    textAlign: "center",
  },
  spacer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  kbdHint: {
    marginLeft: "auto",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  kbdText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
