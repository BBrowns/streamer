import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Platform, View, Text, Pressable } from "react-native";
import { useState, type ComponentProps } from "react";
import { useNotifications } from "../../hooks/useNotifications";
import { useAuthStore } from "../../stores/authStore";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import {
  getWebFocusStyle,
  uiTypography,
} from "../../components/ui/designSystem";
import { useWindowClass } from "../../hooks/useWindowClass";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdaptiveOverlay } from "../../components/ui/AdaptiveOverlay";

function HeaderRight() {
  const router = useRouter();
  const { colors } = useTheme();
  const { unreadCount } = useNotifications();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.displayName || user?.email || "S")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href as never);
  };

  return (
    <>
      <Pressable
        testID="mobile-profile-menu-trigger"
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Profile menu"
        style={({ focused }: any) => [
          styles.mobileAvatar,
          {
            backgroundColor: colors.surfaceOverlay,
            borderColor: colors.borderStrong,
          },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
      >
        <Text style={[styles.mobileAvatarText, { color: colors.text }]}>
          {initials}
        </Text>
      </Pressable>
      <AdaptiveOverlay
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        accessibilityLabel="Profile menu"
        testID="mobile-profile-menu"
        contentStyle={styles.profileMenu}
      >
        <View style={styles.profileHeader}>
          <Text
            numberOfLines={1}
            style={[styles.profileName, { color: colors.text }]}
          >
            {user?.displayName || user?.email || "Profile"}
          </Text>
          <Text
            style={[styles.profileCaption, { color: colors.textSecondary }]}
          >
            Personal profile
          </Text>
        </View>
        <MobileMenuRow
          icon="person-outline"
          label="Profile"
          onPress={() => navigate("/settings/account")}
        />
        <MobileMenuRow
          icon="notifications-outline"
          label={
            unreadCount > 0
              ? `Notifications (${unreadCount > 9 ? "9+" : unreadCount})`
              : "Notifications"
          }
          onPress={() => navigate("/notifications")}
        />
        <MobileMenuRow
          icon="settings-outline"
          label="Settings"
          onPress={() => navigate("/settings")}
        />
        <View
          style={[styles.menuDivider, { backgroundColor: colors.border }]}
        />
        <MobileMenuRow
          icon="log-out-outline"
          label="Sign out"
          destructive
          onPress={() => {
            setMenuOpen(false);
            void logout().then(() => router.replace("/login" as never));
          }}
        />
      </AdaptiveOverlay>
    </>
  );
}

function MobileMenuRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.error : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.68 }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const { isCompact } = useWindowClass();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const hasSideNavigation = !isCompact;

  const tabsContent = (
    <Tabs
      screenOptions={{
        headerStyle: [
          styles.header,
          { backgroundColor: colors.header, borderBottomColor: colors.border },
        ],
        headerTintColor: colors.text,
        headerTitleStyle: {
          ...uiTypography.title,
          fontWeight: "600",
        },
        // DesktopLayout owns the horizontal topbar outside the compact shell.
        headerShown: isCompact,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            height: 64 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
          },
          hasSideNavigation && { display: "none" },
        ],
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.disabled,
        tabBarLabelStyle: {
          fontFamily: uiTypography.sectionLabel.fontFamily,
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          headerRight: () => <HeaderRight />,
          headerTitle: "",
          headerTransparent: true,
          headerShadowVisible: false,
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
          href: null,
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
        name="search"
        options={{
          title: t("tabs.search", { defaultValue: "Search" }),
          headerRight: () => <HeaderRight />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "search" : "search-outline"}
              size={24}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: t("tabs.search", {
            defaultValue: "Search",
          }),
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
          href: null,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  mobileAvatar: {
    width: 38,
    height: 38,
    marginRight: 16,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileAvatarText: { ...uiTypography.sectionLabel, fontSize: 11 },
  profileMenu: { paddingHorizontal: 16, paddingBottom: 20 },
  profileHeader: { paddingHorizontal: 8, paddingVertical: 18, gap: 3 },
  profileName: { ...uiTypography.label, fontSize: 16 },
  profileCaption: { ...uiTypography.caption },
  menuRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  menuLabel: { ...uiTypography.label, fontSize: 15 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
