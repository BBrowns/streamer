import React from "react";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ExternalSubtitleRenderer } from "../ExternalSubtitleRenderer";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 10, left: 0 }),
}));

const cues = [
  { id: "one", start: 1, end: 3, text: "First" },
  { id: "two", start: 2, end: 4, text: "Overlap" },
];

describe("ExternalSubtitleRenderer", () => {
  it("renders overlapping cues from the accepted playback time", () => {
    const screen = render(
      <ExternalSubtitleRenderer
        cues={cues}
        currentTime={2.5}
        offsetSeconds={0}
        textSize="medium"
        background="shadow"
        backgroundOpacity={0.78}
        verticalPosition="low"
        fontFamily="system"
        controlsVisible={false}
      />,
    );

    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Overlap")).toBeTruthy();
    expect(screen.getAllByTestId("external-subtitle-cue")).toHaveLength(2);
  });

  it("applies sync offset and avoids rendering outside cue windows", () => {
    const screen = render(
      <ExternalSubtitleRenderer
        cues={cues}
        currentTime={3.5}
        offsetSeconds={2}
        textSize="large"
        background="box"
        backgroundOpacity={0.5}
        verticalPosition="middle"
        fontFamily="serif"
        controlsVisible
      />,
    );

    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByText("Overlap")).toBeNull();
    expect(
      StyleSheet.flatten(
        screen.getByTestId("external-subtitle-cue").props.style,
      ).backgroundColor,
    ).toBe("rgba(0, 0, 0, 0.5)");
  });
});
