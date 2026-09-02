import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { isFullScreenRoute } from "./desktopShellRoutes";
import { CinematicTopBar } from "./CinematicTopBar";
import { getDesktopTopBarMode } from "./cinematicNavigation";
import {
  getNativePointerEvents,
  getPointerEventsStyle,
} from "../../lib/platformStyles";

type DesktopTopBarScrollReporter = (value: boolean | number) => void;

const DesktopTopBarScrollContext = createContext<DesktopTopBarScrollReporter>(
  () => {},
);

export function useDesktopTopBarScroll() {
  return useContext(DesktopTopBarScrollContext);
}

export function DesktopLayout({
  children,
  onSearchOpen = () => {},
}: {
  children: ReactNode;
  onSearchOpen?: () => void;
}) {
  const pathname = usePathname();
  const { isCompact } = useWindowClass();
  const { colors } = useTheme();
  const [topBarScrolled, setTopBarScrolled] = useState(false);
  const reportTopBarScroll = useCallback<DesktopTopBarScrollReporter>(
    (value) =>
      setTopBarScrolled(typeof value === "number" ? value > 24 : value),
    [],
  );

  useEffect(() => setTopBarScrolled(false), [pathname]);

  if (isCompact) {
    return (
      <DesktopTopBarScrollContext.Provider value={reportTopBarScroll}>
        {children}
      </DesktopTopBarScrollContext.Provider>
    );
  }

  const fullScreen = isFullScreenRoute(pathname);
  const topBarMode = getDesktopTopBarMode(pathname);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          topBarMode === "overlay" ? styles.overlayTopBar : undefined,
          getPointerEventsStyle(fullScreen ? "none" : "box-none"),
        ]}
        pointerEvents={getNativePointerEvents(fullScreen ? "none" : "box-none")}
      >
        {fullScreen ? null : (
          <CinematicTopBar
            mode={topBarMode}
            scrolled={topBarMode === "overlay" && topBarScrolled}
            onSearchOpen={onSearchOpen}
          />
        )}
      </View>
      <DesktopTopBarScrollContext.Provider value={reportTopBarScroll}>
        <View style={styles.content}>{children}</View>
      </DesktopTopBarScrollContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  overlayTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
});
