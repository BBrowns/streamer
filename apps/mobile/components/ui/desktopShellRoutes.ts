const FULL_SCREEN_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/privacy",
  "/terms",
]);

const FULL_SCREEN_ROUTE_PREFIXES = ["/onboarding", "/detail", "/player"];

/** Routes that should own the full viewport instead of appearing inside app navigation. */
export function isFullScreenRoute(pathname: string): boolean {
  if (FULL_SCREEN_ROUTES.has(pathname)) return true;

  return FULL_SCREEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
