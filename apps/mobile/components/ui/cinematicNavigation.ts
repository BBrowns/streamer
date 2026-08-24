export const DESKTOP_PRIMARY_NAV = [
  { href: "/", labelKey: "tabs.home" },
  { href: "/library", labelKey: "tabs.library" },
  { href: "/downloads", labelKey: "tabs.downloads" },
] as const;

export type DesktopTopBarMode = "overlay" | "solid";

export function getDesktopTopBarMode(pathname: string): DesktopTopBarMode {
  if (
    pathname === "/" ||
    pathname === "/index" ||
    pathname === "/detail" ||
    pathname.startsWith("/detail/")
  ) {
    return "overlay";
  }
  return "solid";
}
