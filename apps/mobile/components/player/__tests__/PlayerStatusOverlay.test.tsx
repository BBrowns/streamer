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
  it("shows fallback reason while trying another planned source", () => {
    const screen = render(
      <PlayerStatusOverlay
        streamState="loading_metrics"
        runtimeState="trying_fallback"
        streamMetrics={null}
        isBuffering
        errorMessage={null}
        fallbackReason="Trying another source automatically."
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText("player.status.tryingFallback")).toBeTruthy();
    expect(
      screen.getByText("Trying another source automatically."),
    ).toBeTruthy();
  });

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

  it("uses runtime error titles and hides retry when retry is not useful", () => {
    const screen = render(
      <PlayerStatusOverlay
        streamState="error"
        streamMetrics={null}
        isBuffering={false}
        errorMessage="Unsupported codec h265"
        runtimeError={{
          code: "UNSUPPORTED_CODEC",
          message: "Unsupported codec h265",
          retryable: false,
          shouldFallback: false,
        }}
        onBack={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText("player.status.unsupportedTitle")).toBeTruthy();
    expect(screen.queryByText("common.retry")).toBeNull();
  });
});
