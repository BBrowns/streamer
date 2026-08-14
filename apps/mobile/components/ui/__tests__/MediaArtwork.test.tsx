import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { MediaArtwork } from "../MediaArtwork";

const ExpoImageHost = "ExpoImage" as any;

const getExpoImages = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.root?.queryAll((node) => node.type === ExpoImageHost) ?? [];

const getNodesByTestId = (
  screen: Awaited<ReturnType<typeof render>>,
  testID: string,
) => screen.root?.queryAll((node) => node.props.testID === testID) ?? [];

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

  it("loads remote artwork with resilient cache and recycling settings", async () => {
    const screen = await render(
      <MediaArtwork
        testID="arrival-artwork"
        uri=" https://images.example.test/arrival.jpg "
        title="Arrival"
      />,
    );

    const image = getExpoImages(screen)[0];
    expect(image.props.source).toEqual({
      uri: "https://images.example.test/arrival.jpg",
    });
    expect(image.props.cachePolicy).toBe("memory-disk");
    expect(image.props.recyclingKey).toBe(
      "poster:https://images.example.test/arrival.jpg",
    );
    expect(image.props.transition).toBe(180);
    expect(getNodesByTestId(screen, "arrival-artwork-skeleton")).toHaveLength(
      1,
    );
  });

  it("uses a non-animated image transition when reduced motion is enabled", async () => {
    mockUseReducedMotion.mockReturnValue(true);

    const screen = await render(
      <MediaArtwork uri="https://images.example.test/arrival.jpg" />,
    );

    expect(getExpoImages(screen)[0]?.props.transition).toBe(0);
  });

  it("marks unlabeled artwork as decorative on web", async () => {
    const screen = await render(
      <MediaArtwork
        uri="https://images.example.test/hero.jpg"
        accessible={false}
      />,
    );

    const image = getExpoImages(screen)[0];
    expect(image.props.accessibilityLabel).toBe("");
    expect(image.props.accessible).toBe(false);
  });

  it("passes a deliberate backdrop blur through the shared image primitive", async () => {
    const screen = await render(
      <MediaArtwork
        uri="https://images.example.test/arrival.jpg"
        variant="backdrop"
        blurRadius={20}
      />,
    );

    expect(getExpoImages(screen)[0]?.props.blurRadius).toBe(20);
  });

  it("removes the loading skeleton after the image finishes loading", async () => {
    const screen = await render(
      <MediaArtwork
        testID="arrival-artwork"
        uri="https://images.example.test/arrival.jpg"
      />,
    );

    await fireEvent(getExpoImages(screen)[0]!, "loadEnd");

    expect(getNodesByTestId(screen, "arrival-artwork-skeleton")).toHaveLength(
      0,
    );
  });

  it("replaces a failed remote image with an accessible poster fallback", async () => {
    const screen = await render(
      <MediaArtwork
        testID="arrival-artwork"
        uri="https://images.example.test/arrival.jpg"
        title="Arrival"
      />,
    );

    await fireEvent(getExpoImages(screen)[0]!, "error");

    expect(getExpoImages(screen)).toHaveLength(0);
    expect(screen.getByTestId("arrival-artwork-fallback")).toBeTruthy();
    expect(screen.getByText("Arrival")).toBeTruthy();
  });

  it("recovers when a refetched item replaces an empty image URL", async () => {
    const screen = await render(<MediaArtwork title="Arrival" uri="" />);

    expect(getExpoImages(screen)).toHaveLength(0);
    expect(screen.getByText("Arrival")).toBeTruthy();

    await screen.rerender(
      <MediaArtwork
        title="Arrival"
        uri="https://images.example.test/refetched-arrival.jpg"
      />,
    );

    await waitFor(() => {
      expect(getExpoImages(screen)[0]?.props.source).toEqual({
        uri: "https://images.example.test/refetched-arrival.jpg",
      });
    });
  });
});
