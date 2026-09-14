import { render } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import { RouteAccessibilityBoundary } from "../RouteAccessibilityBoundary";

let mockIsFocused = true;

jest.mock("expo-router", () => ({
  useIsFocused: () => mockIsFocused,
}));

describe("RouteAccessibilityBoundary", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    mockIsFocused = true;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("hides retained web routes and makes them inert when unfocused", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    mockIsFocused = false;

    const screen = await render(
      <RouteAccessibilityBoundary>
        <Text>Retained route</Text>
      </RouteAccessibilityBoundary>,
    );

    const boundary = screen.getByTestId("route-accessibility-boundary", {
      includeHiddenElements: true,
    });
    expect(boundary.props["aria-hidden"]).toBe(true);
    expect(boundary.props.inert).toBe(true);
    expect(boundary.props.accessibilityElementsHidden).toBe(true);
    expect(boundary.props.importantForAccessibility).toBe(
      "no-hide-descendants",
    );
  });

  it("keeps the focused route exposed", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    mockIsFocused = true;

    const screen = await render(
      <RouteAccessibilityBoundary>
        <Text>Focused route</Text>
      </RouteAccessibilityBoundary>,
    );

    const boundary = screen.getByTestId("route-accessibility-boundary", {
      includeHiddenElements: true,
    });
    expect(boundary.props["aria-hidden"]).toBeUndefined();
    expect(boundary.props.inert).toBe(false);
    expect(boundary.props.accessibilityElementsHidden).toBe(false);
    expect(boundary.props.importantForAccessibility).toBe("auto");
  });
});
