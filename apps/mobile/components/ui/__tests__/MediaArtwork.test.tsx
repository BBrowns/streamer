import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { MediaArtwork } from "../MediaArtwork";

const ExpoImageHost = "ExpoImage" as any;

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      card: "#111318",
      surfaceElevated: "#181B21",
      surfaceSubtle: "#0D0F13",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
    },
  }),
}));

const mockUseReducedMotion = jest.fn(() => false);
jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

jest.mock("expo-image", () => ({
  Image: "ExpoImage",
}));

describe("MediaArtwork", () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });

  it("loads remote artwork with resilient cache and recycling settings", () => {
    const screen = render(
      <MediaArtwork
        testID="arrival-artwork"
        uri=" https://images.example.test/arrival.jpg "
        title="Arrival"
      />,
    );

    const image = screen.UNSAFE_getByType(ExpoImageHost);
    expect(image.props.source).toEqual({
      uri: "https://images.example.test/arrival.jpg",
    });
    expect(image.props.cachePolicy).toBe("memory-disk");
    expect(image.props.recyclingKey).toBe(
      "poster:https://images.example.test/arrival.jpg",
    );
    expect(image.props.transition).toBe(180);
    expect(
      screen.UNSAFE_getByProps({ testID: "arrival-artwork-skeleton" }),
    ).toBeTruthy();
  });

  it("uses a non-animated image transition when reduced motion is enabled", () => {
    mockUseReducedMotion.mockReturnValue(true);

    const screen = render(
      <MediaArtwork uri="https://images.example.test/arrival.jpg" />,
    );

    expect(screen.UNSAFE_getByType(ExpoImageHost).props.transition).toBe(0);
  });

  it("removes the loading skeleton after the image finishes loading", () => {
    const screen = render(
      <MediaArtwork
        testID="arrival-artwork"
        uri="https://images.example.test/arrival.jpg"
      />,
    );

    fireEvent(screen.UNSAFE_getByType(ExpoImageHost), "loadEnd");

    expect(
      screen.UNSAFE_queryByProps({ testID: "arrival-artwork-skeleton" }),
    ).toBeNull();
  });

  it("replaces a failed remote image with an accessible poster fallback", () => {
    const screen = render(
      <MediaArtwork
        testID="arrival-artwork"
        uri="https://images.example.test/arrival.jpg"
        title="Arrival"
      />,
    );

    fireEvent(screen.UNSAFE_getByType(ExpoImageHost), "error");

    expect(screen.UNSAFE_queryByType(ExpoImageHost)).toBeNull();
    expect(screen.getByTestId("arrival-artwork-fallback")).toBeTruthy();
    expect(screen.getByText("Arrival")).toBeTruthy();
  });

  it("recovers when a refetched item replaces an empty image URL", async () => {
    const screen = render(<MediaArtwork title="Arrival" uri="" />);

    expect(screen.UNSAFE_queryByType(ExpoImageHost)).toBeNull();
    expect(screen.getByText("Arrival")).toBeTruthy();

    screen.rerender(
      <MediaArtwork
        title="Arrival"
        uri="https://images.example.test/refetched-arrival.jpg"
      />,
    );

    await waitFor(() => {
      expect(screen.UNSAFE_getByType(ExpoImageHost).props.source).toEqual({
        uri: "https://images.example.test/refetched-arrival.jpg",
      });
    });
  });
});
