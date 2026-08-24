import { useEffect } from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";

import { DesktopLayout } from "../DesktopLayout";

let mockPathname = "/detail/movie/movie-1";

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: { background: "#08090B" } }),
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ isCompact: false }),
}));

jest.mock("../CinematicTopBar", () => ({
  CinematicTopBar: ({ scrolled }: { scrolled?: boolean }) => {
    const { View: MockView } = require("react-native");
    return (
      <MockView
        testID="cinematic-top-bar"
        accessibilityLabel={scrolled ? "scrolled" : "top"}
      />
    );
  },
}));

function RouteStackProbe({ onUnmount }: { onUnmount: () => void }) {
  useEffect(() => onUnmount, [onUnmount]);
  return <View testID="route-stack-probe" />;
}

describe("DesktopLayout", () => {
  beforeEach(() => {
    mockPathname = "/detail/movie/movie-1";
  });

  it("keeps the route stack mounted when entering an immersive route", async () => {
    const onUnmount = jest.fn();
    const view = await render(
      <DesktopLayout>
        <RouteStackProbe onUnmount={onUnmount} />
      </DesktopLayout>,
    );

    mockPathname = "/player";
    await view.rerender(
      <DesktopLayout>
        <RouteStackProbe onUnmount={onUnmount} />
      </DesktopLayout>,
    );

    expect(view.getByTestId("route-stack-probe")).toBeTruthy();
    expect(onUnmount).not.toHaveBeenCalled();
  });

  it("lets an overlay route strengthen its topbar after content scrolls", async () => {
    const desktopLayoutModule = require("../DesktopLayout");
    expect(typeof desktopLayoutModule.useDesktopTopBarScroll).toBe("function");
    if (typeof desktopLayoutModule.useDesktopTopBarScroll !== "function") {
      return;
    }
    const { Pressable } = require("react-native");
    function ScrollProbe() {
      const setScrolled = desktopLayoutModule.useDesktopTopBarScroll();
      return (
        <Pressable testID="scroll-probe" onPress={() => setScrolled(true)} />
      );
    }

    const screen = await render(
      <DesktopLayout>
        <ScrollProbe />
      </DesktopLayout>,
    );

    expect(
      screen.getByTestId("cinematic-top-bar").props.accessibilityLabel,
    ).toBe("top");
    await require("@testing-library/react-native").fireEvent.press(
      screen.getByTestId("scroll-probe"),
    );
    expect(
      screen.getByTestId("cinematic-top-bar").props.accessibilityLabel,
    ).toBe("scrolled");
  });
});
