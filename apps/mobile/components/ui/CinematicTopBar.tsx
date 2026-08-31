import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass, type WindowClass } from "../../hooks/useWindowClass";
import { useNotifications } from "../../hooks/useNotifications";
import { useAuthStore } from "../../stores/authStore";
import { getSearchShortcutLabel } from "../../services/searchController";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "./designSystem";
import { AdaptiveOverlay } from "./AdaptiveOverlay";
import {
  DESKTOP_PRIMARY_NAV,
  type DesktopTopBarMode,
} from "./cinematicNavigation";
import type { ThemeColors } from "../../constants/theme";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";

type TopBarPalette = {
  foreground: string;
  secondary: string;
  mark: string;
  onMark: string;
  focus: string;
  hover: string;
  pressed: string;
  avatar: string;
  avatarBorder: string;
};

type TopBarLayout = {
  leftPadding: number;
  rightPadding: number;
  brandWidth: number;
  actionsWidth: number;
  navItemMinWidth: number;
  navItemPaddingHorizontal: number;
  navGap: number;
  navFontSize: number;
};

export function resolveTopBarLayout(
  windowClass: WindowClass,
  macDesktop = true,
): TopBarLayout {
  const medium = windowClass === "medium";
  return {
    leftPadding: macDesktop ? 82 : medium ? 16 : 24,
    rightPadding: medium ? 16 : 24,
    brandWidth: medium ? 48 : 220,
    actionsWidth: medium ? 152 : 220,
    navItemMinWidth: medium ? 60 : 72,
    navItemPaddingHorizontal: medium ? 8 : 12,
    navGap: medium ? 0 : 8,
    navFontSize: medium ? 13 : 14,
  };
}

export function resolveTopBarPalette(
  mode: DesktopTopBarMode,
  colors: ThemeColors,
  isDark: boolean,
): TopBarPalette {
  if (mode === "overlay") {
    return {
      foreground: "#F4F2EE",
      secondary: "rgba(244,242,238,0.74)",
      mark: "#F4F2EE",
      onMark: "#08090B",
      focus: "#F4F2EE",
      hover: "rgba(244,242,238,0.10)",
      pressed: "rgba(244,242,238,0.16)",
      avatar: "rgba(8,9,11,0.30)",
      avatarBorder: "rgba(244,242,238,0.24)",
    };
  }

  return {
    foreground: colors.text,
    secondary: colors.textSecondary,
    mark: colors.primary,
    onMark: colors.onPrimary,
    focus: colors.focus,
    hover: colors.stateHover,
    pressed: colors.statePressed,
    avatar: isDark ? "rgba(244,242,238,0.10)" : colors.surfaceElevated,
    avatarBorder: colors.borderStrong,
  };
}

function isMacDesktopShell() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return (
    Boolean(window.desktopBridge) &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
  );
}

function TopBarIconButton({
  icon,
  label,
  onPress,
  badge,
  palette,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  badge?: number;
  palette: TopBarPalette;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed, focused }: any) => [
        styles.iconButton,
        hovered && { backgroundColor: palette.hover },
        pressed && { backgroundColor: palette.pressed },
        Platform.OS === "web" && focused && getWebFocusStyle(palette.focus),
      ]}
    >
      <Ionicons name={icon} size={20} color={palette.foreground} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.error }]}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ProfileMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const navigate = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <AdaptiveOverlay
      visible={visible}
      onClose={onClose}
      accessibilityLabel={t("navigation.profileMenu")}
      testID="desktop-profile-menu"
      contentStyle={styles.profileMenu}
      backdrop="soft"
    >
      <View style={styles.profileHeader}>
        <Text
          numberOfLines={1}
          style={[styles.profileName, { color: colors.text }]}
        >
          {user?.displayName || user?.email || t("navigation.profile")}
        </Text>
        <Text style={[styles.profileCaption, { color: colors.textSecondary }]}>
          {t("navigation.personalProfile")}
        </Text>
      </View>
      <View
        style={[styles.menuDivider, { backgroundColor: colors.borderSubtle }]}
      />
      <MenuRow
        icon="person-outline"
        label={t("navigation.profile")}
        onPress={() => navigate("/settings/account")}
      />
      <MenuRow
        icon="desktop-outline"
        label={t("settings.items.activeSessions")}
        onPress={() => navigate("/settings/account")}
      />
      {!pathname.startsWith("/settings") ? (
        <MenuRow
          icon="settings-outline"
          label={t("settings.overview.title")}
          onPress={() => navigate("/settings")}
        />
      ) : null}
      <View
        style={[styles.menuDivider, { backgroundColor: colors.borderSubtle }]}
      />
      <MenuRow
        icon="log-out-outline"
        label={t("settings.auth.signOut")}
        destructive
        onPress={() => {
          onClose();
          void logout().then(() => router.replace("/login" as never));
        }}
      />
    </AdaptiveOverlay>
  );
}

function NotificationsMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { notifications, markAsRead } = useNotifications();
  const latest = notifications.slice(0, 4);

  return (
    <AdaptiveOverlay
      visible={visible}
      onClose={onClose}
      accessibilityLabel={t("notifications.title")}
      testID="desktop-notifications-menu"
      contentStyle={styles.notificationsMenu}
      backdrop="soft"
    >
      <Text style={[styles.notificationsTitle, { color: colors.text }]}>
        {t("notifications.title")}
      </Text>
      {latest.length > 0 ? (
        latest.map((notification) => (
          <Pressable
            key={notification.id}
            accessibilityRole={notification.read ? undefined : "button"}
            onPress={() => {
              if (!notification.read) markAsRead.mutate(notification.id);
            }}
            style={({ hovered, pressed, focused }: any) => [
              styles.notificationRow,
              hovered && { backgroundColor: colors.stateHover },
              pressed && { backgroundColor: colors.statePressed },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <View
              style={[
                styles.notificationDot,
                {
                  backgroundColor: notification.read
                    ? "transparent"
                    : colors.info,
                },
              ]}
            />
            <View style={styles.notificationCopy}>
              <Text
                numberOfLines={1}
                style={[styles.notificationTitle, { color: colors.text }]}
              >
                {notification.title}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.notificationMessage,
                  { color: colors.textSecondary },
                ]}
              >
                {notification.message}
              </Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text
          style={[styles.notificationsEmpty, { color: colors.textSecondary }]}
        >
          {t("notifications.allCaughtUpDescription")}
        </Text>
      )}
      <View
        style={[styles.menuDivider, { backgroundColor: colors.borderSubtle }]}
      />
      <MenuRow
        icon="arrow-forward-outline"
        label={t("notifications.viewAll")}
        onPress={() => {
          onClose();
          router.push("/notifications" as never);
        }}
      />
    </AdaptiveOverlay>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const foreground = destructive ? colors.error : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed, focused }: any) => [
        styles.menuRow,
        hovered && { backgroundColor: colors.stateHover },
        pressed && { backgroundColor: colors.statePressed },
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <Ionicons name={icon} size={18} color={foreground} />
      <Text style={[styles.menuLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function CinematicTopBar({
  mode,
  scrolled = false,
  onSearchOpen,
}: {
  mode: DesktopTopBarMode;
  scrolled?: boolean;
  onSearchOpen: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { theme: cinematicTheme } = useCinematicTheme();
  const { windowClass, isLarge, isExpanded } = useWindowClass();
  const { unreadCount } = useNotifications();
  const user = useAuthStore((state) => state.user);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const macDesktop = isMacDesktopShell();
  const topBarLayout = resolveTopBarLayout(windowClass, macDesktop);
  const shortcut = getSearchShortcutLabel(
    typeof navigator === "undefined" ? undefined : navigator.platform,
  );
  const initials = (user?.displayName || user?.email || "S")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const visualMode = mode === "overlay" && scrolled ? "solid" : mode;
  const basePalette = resolveTopBarPalette(visualMode, colors, isDark);
  const palette = {
    ...basePalette,
    focus: mode === "overlay" ? cinematicTheme.focus : basePalette.focus,
  };

  return (
    <>
      <View
        testID="cinematic-topbar"
        style={[
          styles.bar,
          visualMode === "solid"
            ? {
                backgroundColor: colors.surfaceOverlay,
                borderBottomColor: colors.borderSubtle,
              }
            : styles.overlayBar,
          visualMode === "solid" && Platform.OS === "web"
            ? styles.translucentBar
            : null,
          {
            paddingLeft: topBarLayout.leftPadding,
            paddingRight: topBarLayout.rightPadding,
          },
        ]}
      >
        <View
          style={[
            styles.dragRegion,
            styles.brandZone,
            { width: topBarLayout.brandWidth },
          ]}
        >
          <View style={[styles.brandMark, { backgroundColor: palette.mark }]}>
            <Ionicons name="play" size={14} color={palette.onMark} />
          </View>
          {isExpanded || isLarge ? (
            <Text style={[styles.brandName, { color: palette.foreground }]}>
              Streamer
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.controlsRegion,
            styles.nav,
            { gap: topBarLayout.navGap },
          ]}
        >
          {DESKTOP_PRIMARY_NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname === "/index"
                : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href as never} asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  style={({ hovered, pressed, focused }: any) => [
                    styles.navLink,
                    {
                      minWidth: topBarLayout.navItemMinWidth,
                      paddingHorizontal: topBarLayout.navItemPaddingHorizontal,
                    },
                    hovered && { backgroundColor: palette.hover },
                    pressed && { opacity: 0.62 },
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(palette.focus),
                  ]}
                >
                  <Text
                    style={[
                      styles.navText,
                      {
                        color: active ? palette.foreground : palette.secondary,
                        fontSize: topBarLayout.navFontSize,
                      },
                    ]}
                  >
                    {t(item.labelKey)}
                  </Text>
                  {active ? (
                    <View
                      style={[
                        styles.activeUnderline,
                        { backgroundColor: palette.foreground },
                      ]}
                    />
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
        </View>

        <View
          style={[
            styles.controlsRegion,
            styles.actions,
            { width: topBarLayout.actionsWidth },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tabs.search", { defaultValue: "Search" })}
            onPress={onSearchOpen}
            style={({ hovered, pressed, focused }: any) => [
              styles.searchButton,
              hovered && { backgroundColor: palette.hover },
              pressed && { backgroundColor: palette.pressed },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(palette.focus),
            ]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={palette.foreground}
            />
            {isLarge ? (
              <Text style={[styles.shortcut, { color: palette.secondary }]}>
                {shortcut}
              </Text>
            ) : null}
          </Pressable>
          <TopBarIconButton
            icon="notifications-outline"
            label={`Notifications, ${unreadCount} unread`}
            badge={unreadCount}
            palette={palette}
            onPress={() => {
              setProfileOpen(false);
              setNotificationsOpen(true);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("navigation.profileMenu")}
            onPress={() => {
              setNotificationsOpen(false);
              setProfileOpen(true);
            }}
            style={({ hovered, pressed, focused }: any) => [
              styles.avatar,
              {
                backgroundColor: palette.avatar,
                borderColor: palette.avatarBorder,
              },
              hovered && { backgroundColor: palette.hover },
              pressed && { opacity: 0.7 },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(palette.focus),
            ]}
          >
            <Text style={[styles.avatarText, { color: palette.foreground }]}>
              {initials}
            </Text>
          </Pressable>
        </View>
      </View>
      <NotificationsMenu
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
      <ProfileMenu
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 72,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    zIndex: 30,
  },
  overlayBar: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
  },
  translucentBar: {
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  } as never,
  dragRegion: { WebkitAppRegion: "drag" } as never,
  controlsRegion: { WebkitAppRegion: "no-drag" } as never,
  brandZone: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { ...uiTypography.control, fontSize: 16, letterSpacing: -0.2 },
  nav: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 8 },
  navLink: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiRadii.control,
  },
  navText: { ...uiTypography.label, fontSize: 14 },
  activeUnderline: {
    position: "absolute",
    bottom: 5,
    width: 18,
    height: 2,
    borderRadius: uiRadii.pill,
  },
  actions: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: uiSpacing.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: uiRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButton: {
    minWidth: 44,
    height: 44,
    borderRadius: uiRadii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpacing.sm,
    paddingHorizontal: uiSpacing.md,
  },
  shortcut: { ...uiTypography.caption, fontSize: 11 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...uiTypography.sectionLabel, fontSize: 11 },
  badge: {
    position: "absolute",
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: uiRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  profileMenu: { width: 320 },
  notificationsMenu: { width: 360, paddingVertical: 8 },
  notificationsTitle: {
    ...uiTypography.label,
    fontSize: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  notificationRow: {
    minHeight: 64,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: uiRadii.control,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  notificationDot: {
    width: 6,
    height: 6,
    marginTop: 7,
    borderRadius: uiRadii.pill,
  },
  notificationCopy: { flex: 1, minWidth: 0, gap: 2 },
  notificationTitle: { ...uiTypography.label },
  notificationMessage: { ...uiTypography.caption },
  notificationsEmpty: {
    ...uiTypography.body,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  profileHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  profileName: { ...uiTypography.control },
  profileCaption: { ...uiTypography.caption, marginTop: 2 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  menuRow: {
    minHeight: 44,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    borderRadius: uiRadii.control,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLabel: { ...uiTypography.label, fontSize: 14 },
});
