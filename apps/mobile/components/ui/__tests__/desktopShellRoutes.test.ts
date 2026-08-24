import { isFullScreenRoute } from "../desktopShellRoutes";

describe("isFullScreenRoute", () => {
  it.each([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/privacy",
    "/terms",
    "/onboarding",
    "/onboarding/setup",
    "/player",
  ])("uses the full viewport for %s", (pathname) => {
    expect(isFullScreenRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/library",
    "/downloads",
    "/settings",
    "/search/results",
    "/detail/movie/42",
    "/player-settings",
  ])("keeps app navigation for %s", (pathname) => {
    expect(isFullScreenRoute(pathname)).toBe(false);
  });
});
