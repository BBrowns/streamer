import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { AppSwitch } from "../AppSwitch";

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: "#08090B",
      card: "#111318",
      surfaceElevated: "#181B21",
      text: "#F4F2EE",
      border: "rgba(244,245,247,0.09)",
      stateHover: "rgba(255,255,255,0.04)",
      statePressed: "rgba(255,255,255,0.08)",
      focus: "#E2E5EA",
    },
  }),
}));

describe("AppSwitch", () => {
  it("keeps the active thumb visible on the dark active track", async () => {
    const screen = await render(
      <AppSwitch
        value
        onValueChange={() => {}}
        accessibilityLabel="Dynamic artwork colour"
        testID="artwork-switch"
      />,
    );

    const track = screen.getByTestId("artwork-switch-track");
    const thumb = screen.getByTestId("artwork-switch-thumb");

    expect(StyleSheet.flatten(track.props.style)).toMatchObject({
      backgroundColor: "#F4F2EE",
    });
    expect(StyleSheet.flatten(thumb.props.style)).toMatchObject({
      backgroundColor: "#08090B",
    });
  });
});
