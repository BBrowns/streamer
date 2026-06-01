import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { PlayerStatusOverlay } from "../PlayerStatusOverlay";

jest.mock("@expo/vector-icons", () => ({
  MaterialIcons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#a78bfa",
      error: "#ff9ba6",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.16)",
    },
  }),
}));

describe("PlayerStatusOverlay", () => {
  it("offers retry and Sources & Devices actions on playback errors", () => {
    const onRetry = jest.fn();
    const onOpenSourcesDevices = jest.fn();
    const onBack = jest.fn();

    const screen = render(
      <PlayerStatusOverlay
        streamState="error"
        streamMetrics={null}
        isBuffering={false}
        errorMessage="The desktop bridge is not ready."
        onBack={onBack}
        onRetry={onRetry}
        onOpenSourcesDevices={onOpenSourcesDevices}
      />,
    );

    fireEvent.press(screen.getByText("common.retry"));
    fireEvent.press(screen.getByText("player.errors.openSourcesDevices"));
    fireEvent.press(screen.getByText("player.errors.goBack"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenSourcesDevices).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
