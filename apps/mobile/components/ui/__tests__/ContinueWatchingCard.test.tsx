import { Platform, StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import {
  ContinueWatchingCard,
  getContinueWatchingArtworkMode,
  shouldShowContinueWatchingQuickActions,
} from "../ContinueWatchingCard";
import { uiTouchTarget } from "../designSystem";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("../MediaArtwork", () => ({ MediaArtwork: () => null }));
jest.mock("../AdaptiveOverlay", () => ({
  AdaptiveOverlay: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));
jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ isCompact: false }),
}));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#08090B",
      card: "#111318",
      surfaceElevated: "#181B21",
      stateSelected: "rgba(130,91,57,.08)",
      stateHover: "rgba(255,255,255,.04)",
      statePressed: "rgba(255,255,255,.08)",
      tint: "#A26F46",
      primary: "#F4F2EE",
      onPrimary: "#08090B",
      text: "#F4F2EE",
      textSecondary: "#B8B5B0",
      textTertiary: "#85848A",
      error: "#FF7087",
      focus: "#C98B58",
    },
  }),
}));
jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({
    theme: {
      progress: "#D68A52",
      focus: "#E29A65",
      ambient: "#21150F",
      ambientMuted: "#130F0C",
      accentSoft: "rgba(214,138,82,0.16)",
      glow: "rgba(214,138,82,0.18)",
    },
  }),
}));

function resolvedStyle(style: unknown) {
  const value =
    typeof style === "function"
      ? style({ hovered: false, pressed: false, focused: false })
      : style;
  return StyleSheet.flatten(value as never);
}

describe("ContinueWatchingCard", () => {
  it("prefers a landscape backdrop and never promotes a portrait poster to backdrop", () => {
    expect(
      getContinueWatchingArtworkMode({
        background: "https://images.example.test/backdrop.jpg",
        poster: "https://images.example.test/poster.jpg",
      }),
    ).toBe("backdrop");
    expect(
      getContinueWatchingArtworkMode({
        background: null,
        poster: "https://images.example.test/poster.jpg",
      }),
    ).toBe("contained-poster");
    expect(
      getContinueWatchingArtworkMode({ background: null, poster: null }),
    ).toBe("ambient");
  });

  it("anchors the legacy poster fallback to an ambient edge instead of centering it in a dark card", async () => {
    const screen = await render(
      <ContinueWatchingCard
        title="Legacy title"
        poster="https://images.example.test/poster.jpg"
        kicker="Movie"
        metadata="12m watched"
        onOpen={jest.fn()}
        onResume={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(
      StyleSheet.flatten(
        screen.getByTestId("continue-watching-contained-poster").props.style,
      ),
    ).toMatchObject({
      alignItems: "flex-end",
      backgroundColor: "#130F0C",
    });
  });

  it("reveals desktop quick actions only for hover or keyboard interaction", () => {
    expect(
      shouldShowContinueWatchingQuickActions({
        platform: "web",
        isCompact: false,
        hovered: false,
        focused: false,
      }),
    ).toBe(false);
    expect(
      shouldShowContinueWatchingQuickActions({
        platform: "web",
        isCompact: false,
        hovered: true,
        focused: false,
      }),
    ).toBe(true);
    expect(
      shouldShowContinueWatchingQuickActions({
        platform: "web",
        isCompact: true,
        hovered: false,
        focused: false,
      }),
    ).toBe(true);
  });

  it("keeps quick actions available while the pointer moves from artwork to the actions", async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    const screen = await render(
      <ContinueWatchingCard
        title="Dune: Part Two"
        kicker="Movie"
        metadata="43% watched"
        onOpen={jest.fn()}
        onResume={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    const card = screen.getByTestId("continue-watching-card");
    const openArea = screen.getByLabelText("View Details: Dune: Part Two");
    const getActionPointerEvents = () =>
      screen.getByTestId("continue-watching-quick-actions").props.pointerEvents;

    expect(getActionPointerEvents()).toBe("none");
    await fireEvent(card, "pointerEnter");
    expect(getActionPointerEvents()).toBe("auto");

    await fireEvent(openArea, "hoverOut");
    expect(getActionPointerEvents()).toBe("auto");

    await fireEvent(card, "pointerLeave");
    expect(getActionPointerEvents()).toBe("none");
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("keeps Resume and More actions at the platform touch-target size", async () => {
    const screen = await render(
      <ContinueWatchingCard
        title="Dune: Part Two"
        kicker="Movie"
        metadata="43% watched"
        onOpen={jest.fn()}
        onResume={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    const resume = resolvedStyle(
      screen.getByLabelText("Resume Dune: Part Two").props.style,
    );
    const more = resolvedStyle(
      screen.getByLabelText("More actions for Dune: Part Two").props.style,
    );

    expect(resume.minHeight).toBeGreaterThanOrEqual(uiTouchTarget);
    expect(more.width).toBeGreaterThanOrEqual(uiTouchTarget);
    expect(more.height).toBeGreaterThanOrEqual(uiTouchTarget);
  });
});
