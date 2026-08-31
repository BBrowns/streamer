import { render } from "@testing-library/react-native";
import { AppIconButton } from "../AppIconButton";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      text: "#101216",
      stateHover: "rgba(16,18,22,0.04)",
      statePressed: "rgba(16,18,22,0.08)",
      focus: "#303844",
      error: "#B8324D",
    },
  }),
}));

jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {
      focusable: true,
      tabIndex: 0,
      onKeyDown: jest.fn(),
    },
  }),
}));

describe("AppIconButton", () => {
  it("exposes an accessible icon-only control", async () => {
    const screen = await render(
      <AppIconButton
        icon="close"
        accessibilityLabel="Close"
        onPress={() => {}}
      />,
    );

    const button = screen.getByRole("button", { name: "Close" });
    expect(button.props.accessibilityLabel).toBe("Close");
  });

  it("does not add keyboard activation props when disabled", async () => {
    const screen = await render(
      <AppIconButton
        icon="close"
        accessibilityLabel="Close"
        onPress={() => {}}
        disabled
      />,
    );

    const button = screen.getByRole("button", { name: "Close" });
    expect(button.props.focusable).toBe(false);
    expect(button.props.tabIndex).toBe(-1);
    expect(button.props.onKeyDown).toBeUndefined();
  });

  it("treats a loading icon action as unavailable to interaction", async () => {
    const screen = await render(
      <AppIconButton
        icon="trash-outline"
        accessibilityLabel="Remove"
        onPress={() => {}}
        loading
      />,
    );

    const button = screen.getByRole("button", { name: "Remove" });
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(button.props.focusable).toBe(false);
    expect(button.props.tabIndex).toBe(-1);
  });
});
