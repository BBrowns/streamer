import {
  getSearchResultCountLabel,
  getSearchResultHeading,
} from "../searchPresentation";

describe("search result presentation", () => {
  it("uses the active query as the heading", () => {
    expect(getSearchResultHeading("  Dune Part Two ")).toBe("Dune Part Two");
  });

  it.each([
    [0, "0 results"],
    [1, "1 result"],
    [42, "42 results"],
  ])("formats %s as secondary result metadata", (count, expected) => {
    expect(getSearchResultCountLabel(count)).toBe(expected);
  });
});
