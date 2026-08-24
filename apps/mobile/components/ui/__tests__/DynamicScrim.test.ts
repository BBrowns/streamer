import { getDynamicScrimBottomColors } from "../DynamicScrim";

jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({
    theme: {
      scrimDark: "rgba(8,9,11,0.86)",
      scrimTransparent: "rgba(8,9,11,0)",
    },
  }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#08090B",
      scrimSoft: "rgba(8,9,11,0.56)",
    },
  }),
}));

describe("DynamicScrim", () => {
  it("finishes the hero fade in the active page canvas", () => {
    expect(
      getDynamicScrimBottomColors(
        {
          scrimTransparent: "rgba(8,9,11,0)",
        },
        {
          scrimSoft: "rgba(243,242,239,0.58)",
          background: "#F3F2EF",
        },
      ),
    ).toEqual([
      "rgba(8,9,11,0)",
      "rgba(8,9,11,0)",
      "rgba(243,242,239,0.58)",
      "#F3F2EF",
    ]);
  });
});
