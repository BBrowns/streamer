import {
  DESKTOP_PRIMARY_NAV,
  getDesktopTopBarMode,
} from "../cinematicNavigation";

describe("cinematic desktop navigation", () => {
  it("keeps desktop primary navigation intentionally compact", () => {
    expect(DESKTOP_PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/",
      "/library",
      "/downloads",
    ]);
  });

  it.each([
    ["/", "overlay"],
    ["/index", "overlay"],
    ["/detail/movie/42", "overlay"],
    ["/library", "solid"],
    ["/settings", "solid"],
  ] as const)("uses %s chrome for %s", (pathname, mode) => {
    expect(getDesktopTopBarMode(pathname)).toBe(mode);
  });
});
