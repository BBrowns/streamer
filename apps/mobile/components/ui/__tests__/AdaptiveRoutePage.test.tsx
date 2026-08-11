import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { AdaptiveRoutePage } from "../AdaptiveRoutePage";

const mockUseWindowClass = jest.fn(() => ({
  windowClass: "large",
  isCompact: false,
  isMedium: false,
  isExpanded: false,
  isLarge: true,
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => mockUseWindowClass(),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: { background: "#08090C", text: "#F4F5F7" } }),
}));

describe("AdaptiveRoutePage", () => {
  beforeEach(() => {
    mockUseWindowClass.mockReturnValue({
      windowClass: "large",
      isCompact: false,
      isMedium: false,
      isExpanded: false,
      isLarge: true,
    });
  });

  it("renders the editorial title on large windows", () => {
    const screen = render(
      <AdaptiveRoutePage title="Notifications" boundary="reading">
        <React.Fragment />
      </AdaptiveRoutePage>,
    );

    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByTestId("adaptive-route-page-header")).toBeTruthy();
  });

  it("keeps supporting copy and actions while navigation owns the title", () => {
    mockUseWindowClass.mockReturnValue({
      windowClass: "medium",
      isCompact: false,
      isMedium: true,
      isExpanded: false,
      isLarge: false,
    });

    const screen = render(
      <AdaptiveRoutePage
        title="Notifications"
        description="1 unread notification"
        actions={<Text>Mark all read</Text>}
        boundary="reading"
      >
        <React.Fragment />
      </AdaptiveRoutePage>,
    );

    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.getByText("1 unread notification")).toBeTruthy();
    expect(screen.getByText("Mark all read")).toBeTruthy();
  });
});
