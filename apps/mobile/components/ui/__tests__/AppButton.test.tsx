import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";

import { AppButton, resolveAppButtonFocusColor } from "../AppButton";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#101216",
      onPrimary: "#FFFFFF",
      error: "#B8324D",
      text: "#101216",
      surfaceElevated: "#E9E8E4",
      border: "rgba(16,18,22,0.09)",
      focus: "#7A4C2E",
    },
  }),
}));

describe("AppButton", () => {
  it("uses a stable light foreground for ghost actions over artwork", async () => {
    const screen = await render(
      <AppButton label="View details" variant="ghost" tone="onArtwork" />,
    );

    expect(
      StyleSheet.flatten(screen.getByText("View details").props.style),
    ).toMatchObject({
      color: "#F4F2EE",
    });
  });

  it("accepts the active media focus colour without changing its fill", async () => {
    const screen = await render(
      <AppButton label="Play" variant="primary" focusColor="#365B78" />,
    );

    expect(
      StyleSheet.flatten(screen.getByLabelText("Play").props.style),
    ).toMatchObject({ backgroundColor: "#101216" });
    expect(
      resolveAppButtonFocusColor({
        focusColor: "#365B78",
        onArtwork: false,
        themeFocus: "#7A4C2E",
      }),
    ).toBe("#365B78");
  });

  it("keeps secondary utility actions quiet instead of using an elevated fill", async () => {
    const screen = await render(
      <AppButton label="Select" variant="secondary" />,
    );

    expect(
      StyleSheet.flatten(screen.getByLabelText("Select").props.style),
    ).toMatchObject({
      backgroundColor: "transparent",
      borderColor: "rgba(16,18,22,0.09)",
    });
  });
});
