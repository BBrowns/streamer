import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { useWindowClass, type WindowClass } from "../../hooks/useWindowClass";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTheme } from "../../hooks/useTheme";
import { uiRadii, uiSpacing } from "./designSystem";
import { FloatingSurface, type FloatingSurfaceLevel } from "./FloatingSurface";

export type AdaptiveOverlayPresentation =
  "popover" | "floating-sheet" | "bottom-sheet";
export type AdaptiveOverlaySize = "menu" | "form" | "wide";
export type AdaptiveOverlayPlacement = "top-right" | "top-center" | "center";
export type AdaptiveOverlayBackdrop = "standard" | "soft" | "none";

export function resolveAdaptiveOverlayPresentation(
  windowClass: WindowClass,
): AdaptiveOverlayPresentation {
  if (windowClass === "compact") return "bottom-sheet";
  if (windowClass === "medium") return "floating-sheet";
  return "popover";
}

export function resolveAdaptiveOverlayLayout(
  windowClass: WindowClass,
  size: AdaptiveOverlaySize = "menu",
  placement: AdaptiveOverlayPlacement = "top-right",
) {
  const presentation = resolveAdaptiveOverlayPresentation(windowClass);
  if (presentation === "bottom-sheet") {
    return {
      presentation,
      placement: "bottom" as const,
      maxWidth: undefined,
    };
  }
  return {
    presentation,
    placement:
      presentation === "floating-sheet" ? ("center" as const) : placement,
    maxWidth: size === "form" ? 560 : size === "wide" ? 640 : 380,
  };
}

export function resolveAdaptiveOverlayBackdrop(
  backdrop: AdaptiveOverlayBackdrop,
  isDark: boolean,
) {
  if (backdrop === "none") return "transparent";
  if (backdrop === "soft") {
    return isDark ? "rgba(0,0,0,0.16)" : "rgba(16,18,22,0.08)";
  }
  return undefined;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

export function resolveFocusTrapTarget(
  focusables: HTMLElement[],
  activeElement: Element | null,
  activeInsideSurface: boolean,
  shiftKey: boolean,
) {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!activeInsideSurface) return shiftKey ? last : first;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function AdaptiveOverlay({
  visible,
  onClose,
  children,
  accessibilityLabel,
  testID,
  backdropTestID,
  contentStyle,
  size = "menu",
  placement = "top-right",
  backdrop = "standard",
  animationType,
  materialLevel,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel: string;
  testID?: string;
  backdropTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  size?: AdaptiveOverlaySize;
  placement?: AdaptiveOverlayPlacement;
  backdrop?: AdaptiveOverlayBackdrop;
  animationType?: "none" | "fade";
  materialLevel?: FloatingSurfaceLevel;
}) {
  const { windowClass } = useWindowClass();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const layout = resolveAdaptiveOverlayLayout(windowClass, size, placement);
  const { presentation } = layout;
  const backdropColor =
    resolveAdaptiveOverlayBackdrop(backdrop, isDark) ?? colors.scrim;
  const surfaceRef = useRef<View>(null);

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current as unknown as HTMLElement | null;
    if (surface) getFocusableElements(surface)[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !surface) return;
      const focusables = getFocusableElements(surface);
      const activeElement = document.activeElement;
      const target = resolveFocusTrapTarget(
        focusables,
        activeElement,
        surface.contains(activeElement),
        event.shiftKey,
      );
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={animationType ?? (reducedMotion ? "none" : "fade")}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.viewport,
          presentation === "bottom-sheet" && styles.alignBottom,
          layout.placement === "center" && styles.alignCenter,
          layout.placement === "top-center" && styles.alignTopCenter,
          layout.placement === "top-right" && styles.alignPopover,
        ]}
      >
        <Pressable
          testID={backdropTestID}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: backdropColor }]}
        />
        <FloatingSurface
          testID={testID}
          level={
            materialLevel ?? (presentation === "popover" ? "menu" : "sheet")
          }
          style={[
            styles.surface,
            presentation === "bottom-sheet" && styles.bottomSheet,
            presentation === "floating-sheet" && [
              styles.floatingSheet,
              { maxWidth: layout.maxWidth },
            ],
            presentation === "popover" && [
              styles.popover,
              { maxWidth: layout.maxWidth },
            ],
            // Feature-specific geometry may refine the generic presentation;
            // material and breakpoint ownership remain with this primitive.
            contentStyle,
          ]}
        >
          <View
            ref={surfaceRef}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            role="dialog"
            style={styles.content}
          >
            {presentation === "bottom-sheet" ? (
              <View
                accessibilityElementsHidden
                style={[
                  styles.grabber,
                  { backgroundColor: colors.borderStrong },
                ]}
              />
            ) : null}
            {children}
          </View>
        </FloatingSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  alignBottom: { justifyContent: "flex-end" },
  alignCenter: { alignItems: "center", justifyContent: "center", padding: 24 },
  alignTopCenter: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "web" ? ("15vh" as any) : 72,
    paddingHorizontal: 16,
  },
  alignPopover: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 80,
    paddingRight: 32,
  },
  surface: { maxHeight: "88%" },
  bottomSheet: {
    width: "100%",
    maxHeight: "92%",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  floatingSheet: { width: "100%" },
  popover: { width: "100%", maxHeight: "78%", borderRadius: uiRadii.lg },
  content: { minWidth: 0 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: uiRadii.pill,
    alignSelf: "center",
    marginTop: uiSpacing.sm,
  },
});
