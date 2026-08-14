import { fireEvent, render } from "@testing-library/react-native";
import { InlineNotice } from "../InlineNotice";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      tint: "#8064e8",
      text: "#211c2b",
      textSecondary: "#6f687b",
      success: "#2b8a57",
      warning: "#b47700",
      error: "#c2413b",
      border: "#ded9e5",
      card: "#ffffff",
    },
  }),
}));

describe("InlineNotice", () => {
  it("exposes errors as alerts and keeps recovery actions reachable", async () => {
    const onAction = jest.fn();
    const screen = await render(
      <InlineNotice
        testID="addon-feedback"
        tone="error"
        message="The add-on could not be removed."
        actionLabel="Retry"
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId("addon-feedback").props.accessibilityRole).toBe(
      "alert",
    );
    expect(screen.getByText("The add-on could not be removed.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses a polite status for non-error feedback", async () => {
    const screen = await render(
      <InlineNotice tone="success" message="Add-on installed." />,
    );

    expect(screen.getByText("Add-on installed.")).toBeTruthy();
  });
});
