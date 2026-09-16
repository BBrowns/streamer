import type { Href, useRouter } from "expo-router";
import { Platform } from "react-native";

export type Router = ReturnType<typeof useRouter>;

export function blurWebFocus() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
}

export function goBackOrReplace(router: Router, fallback: Href = "/") {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* fall through to the stable fallback route */
  }

  router.replace(fallback);
}
