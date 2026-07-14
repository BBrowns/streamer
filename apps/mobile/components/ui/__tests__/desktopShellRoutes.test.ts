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
    "/detail/movie/42",
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
    "/player-settings",
  ])("keeps app navigation for %s", (pathname) => {
    expect(isFullScreenRoute(pathname)).toBe(false);
  });
});
