import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { CatalogItemCard } from "../CatalogItemCard";
import type { MetaPreview } from "@streamer/shared";

const ExpoImageHost = "ExpoImage" as any;

const getExpoImages = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.root?.queryAll((node) => node.type === ExpoImageHost) ?? [];

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../lib/haptics", () => ({
  hapticImpactLight: jest.fn(),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#d8b4fe",
      card: "#22222d",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.18)",
    },
  }),
}));

jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));

jest.mock("../../ui/WatchProgressBar", () => ({
  WatchProgressBar: () => null,
}));

jest.mock("expo-image", () => ({
  Image: "ExpoImage",
}));

const createItem = (overrides: Partial<MetaPreview> = {}): MetaPreview => ({
  id: "tt123",
  type: "movie",
  name: "Example Movie",
  poster: "https://images.example.test/poster.jpg",
  releaseInfo: "2026",
  imdbRating: "7.4",
  ...overrides,
});

describe("CatalogItemCard", () => {
  it("passes poster URLs to the image component as uri sources", async () => {
    const poster = "https://images.example.test/poster.jpg";
    const screen = await render(
      <CatalogItemCard item={createItem({ poster })} />,
    );

    expect(getExpoImages(screen)[0]?.props.source).toEqual({
      uri: poster,
    });
  });

  it("recovers from a cached empty poster when the catalog refetch supplies one", async () => {
    const poster = "https://images.example.test/refetched-poster.jpg";
    const screen = await render(
      <CatalogItemCard item={createItem({ poster: "" })} />,
    );

    expect(getExpoImages(screen)).toHaveLength(0);
    expect(screen.getAllByText("Example Movie").length).toBeGreaterThan(0);

    await screen.rerender(<CatalogItemCard item={createItem({ poster })} />);

    await waitFor(() => {
      expect(getExpoImages(screen)[0]?.props.source).toEqual({
        uri: poster,
      });
    });
  });
});
