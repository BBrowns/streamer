import React from "react";
import { render } from "@testing-library/react-native";
import { SearchResultCard } from "../SearchResultCard";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      focus: "#88f",
      surfaceElevated: "#111",
      text: "#fff",
      textSecondary: "#aaa",
      warning: "#fa0",
    },
  }),
}));
jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "search.types.movie": "Movie",
        "search.types.series": "Series",
        "search.a11y.openDetails": "Open title details",
      })[key] ?? key,
  }),
}));

describe("SearchResultCard accessibility", () => {
  it("announces enough metadata to distinguish similarly named releases", () => {
    const screen = render(
      <SearchResultCard
        item={{
          id: "dune-2021",
          type: "movie",
          name: "Dune",
          poster: "",
          releaseInfo: "2021",
          imdbRating: "8.0",
          providerIds: ["catalog"],
          providerNames: ["Catalog"],
        }}
      />,
    );

    expect(screen.getByRole("link").props.accessibilityLabel).toBe(
      "Dune, Movie, 2021, 8.0",
    );
  });
});
